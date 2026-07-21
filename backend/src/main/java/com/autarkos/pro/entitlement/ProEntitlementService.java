package com.autarkos.pro.entitlement;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongUnaryOperator;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditEventType;
import com.autarkos.pro.audit.ProAuditException;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.controlplane.DeviceOperationProofFactory;
import com.autarkos.pro.controlplane.DeviceRegistrationProofFactory;
import com.autarkos.pro.controlplane.ProControlPlaneClient;
import com.autarkos.pro.controlplane.ProControlPlaneException;
import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DeviceIdentityException;
import com.autarkos.pro.identity.DeviceIdentityService;
import com.autarkos.pro.model.ProContractVerificationException;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.model.ProModuleState;
import com.autarkos.pro.module.ProModuleManager.ProModuleAuthorization;
import com.autarkos.pro.module.ProModuleStatusProvider;

@Service
public class ProEntitlementService {

    public static final String DEACTIVATION_CONFIRMATION =
            "DEACTIVATE-AUTARK-PRO";
    private static final int MAX_ACTIVATION_ATTEMPTS = 16;
    private static final Duration MINIMUM_RETRY_DELAY = Duration.ofSeconds(5);
    private static final Duration EXPIRY_SAFETY_MARGIN = Duration.ofMinutes(1);
    private static final Duration RENEWAL_SAFETY_MARGIN = Duration.ofHours(1);

    private final ProEntitlementRepository repository;
    private final ProControlPlaneClient controlPlaneClient;
    private final DeviceIdentityService identityService;
    private final DeviceRegistrationProofFactory registrationProofFactory;
    private final DeviceOperationProofFactory operationProofFactory;
    private final GrantVerifier grantVerifier;
    private final ServiceLeaseVerifier leaseVerifier;
    private final ProEntitlementStateReducer reducer;
    private final ProAuditService audit;
    private final Clock clock;
    private final LongUnaryOperator randomOffset;
    private final Duration onlineGrace;
    private final Duration retryBase;
    private final Duration retryMaximum;
    private final Duration renewalJitterMaximum;
    private final String architecture;
    private final String coreVersion;
    private volatile ProModuleStatusProvider moduleStatusProvider =
            entitlement -> new ProStatusResponse.ModuleStatus(
                    ProModuleState.NOT_INSTALLED,
                    null,
                    null,
                    null,
                    "not-checked",
                    null,
                    null);
    private final AtomicReference<CompletableFuture<ProStatusResponse>> refreshInFlight =
            new AtomicReference<>();
    private final ConcurrentMap<UUID, ActivationAttempt> activationAttempts =
            new ConcurrentHashMap<>();
    private final Object cacheMutationLock = new Object();
    private long cacheGeneration;

    @Autowired
    public ProEntitlementService(
            ProEntitlementRepository repository,
            ProControlPlaneClient controlPlaneClient,
            DeviceIdentityService identityService,
            DeviceRegistrationProofFactory registrationProofFactory,
            DeviceOperationProofFactory operationProofFactory,
            GrantVerifier grantVerifier,
            ServiceLeaseVerifier leaseVerifier,
            ProEntitlementStateReducer reducer,
            ProAuditService audit,
            @Value("${autark.pro.entitlement.online-grace:14d}") Duration onlineGrace,
            @Value("${autark.pro.entitlement.retry-base:1m}") Duration retryBase,
            @Value("${autark.pro.entitlement.retry-maximum:1h}") Duration retryMaximum,
            @Value("${autark.pro.entitlement.renewal-jitter-maximum:30m}")
                    Duration renewalJitterMaximum,
            @Value("${autark.pro.architecture:}") String configuredArchitecture,
            @Value("${autark.pro.core-version:${AUTARK_OS_VERSION:0.0.1-SNAPSHOT}}")
                    String coreVersion) {
        this(
                repository,
                controlPlaneClient,
                identityService,
                registrationProofFactory,
                operationProofFactory,
                grantVerifier,
                leaseVerifier,
                reducer,
                audit,
                Clock.systemUTC(),
                bound -> bound <= 1
                        ? 0
                        : ThreadLocalRandom.current().nextLong(bound),
                onlineGrace,
                retryBase,
                retryMaximum,
                renewalJitterMaximum,
                resolveArchitecture(configuredArchitecture),
                coreVersion);
    }

    ProEntitlementService(
            ProEntitlementRepository repository,
            ProControlPlaneClient controlPlaneClient,
            DeviceIdentityService identityService,
            DeviceRegistrationProofFactory registrationProofFactory,
            DeviceOperationProofFactory operationProofFactory,
            GrantVerifier grantVerifier,
            ServiceLeaseVerifier leaseVerifier,
            ProEntitlementStateReducer reducer,
            ProAuditService audit,
            Clock clock,
            LongUnaryOperator randomOffset,
            Duration onlineGrace,
            Duration retryBase,
            Duration retryMaximum,
            Duration renewalJitterMaximum,
            String architecture,
            String coreVersion) {
        this.repository = Objects.requireNonNull(repository);
        this.controlPlaneClient = Objects.requireNonNull(controlPlaneClient);
        this.identityService = Objects.requireNonNull(identityService);
        this.registrationProofFactory = Objects.requireNonNull(registrationProofFactory);
        this.operationProofFactory = Objects.requireNonNull(operationProofFactory);
        this.grantVerifier = Objects.requireNonNull(grantVerifier);
        this.leaseVerifier = Objects.requireNonNull(leaseVerifier);
        this.reducer = Objects.requireNonNull(reducer);
        this.audit = audit;
        this.clock = Objects.requireNonNull(clock);
        this.randomOffset = Objects.requireNonNull(randomOffset);
        this.onlineGrace = nonNegative(onlineGrace);
        this.retryBase = positive(retryBase, Duration.ofMinutes(1));
        this.retryMaximum = maximum(
                this.retryBase,
                positive(retryMaximum, Duration.ofHours(1)));
        this.renewalJitterMaximum = nonNegative(renewalJitterMaximum);
        this.architecture = requireArchitecture(architecture);
        this.coreVersion = requireCoreVersion(coreVersion);
    }

    public ProStatusResponse status() {
        cleanupActivationAttempts();
        return status(refreshInFlight.get() != null);
    }

    @Autowired(required = false)
    public void setModuleStatusProvider(
            ProModuleStatusProvider moduleStatusProvider) {
        if (moduleStatusProvider != null) {
            this.moduleStatusProvider = moduleStatusProvider;
        }
    }

    public ProModuleAuthorization moduleAuthorization() {
        ProStatusResponse current = status();
        String releaseChannel = null;
        try {
            ProEntitlementCache cache = repository.load().orElse(null);
            VerifiedCache verified =
                    verifyCache(cache, identityService.current());
            if (verified.grant() != null
                    && Objects.equals(
                            current.entitlement().grantFingerprint(),
                            verified.grant().fingerprint())) {
                releaseChannel =
                        verified.grant().grant().releaseChannel();
            }
        } catch (RuntimeException ignored) {
            // The manager receives no release channel and fails closed.
        }
        return new ProModuleAuthorization(
                current.entitlement(),
                releaseChannel);
    }

    public ActivationStartResult startActivation(String activationCode) {
        cleanupActivationAttempts();
        if (activationAttempts.size() >= MAX_ACTIVATION_ATTEMPTS) {
            throw new ProEntitlementApiException(
                    "too_many_activation_attempts",
                    "Too many activation attempts are already pending.",
                    HttpStatus.TOO_MANY_REQUESTS);
        }
        DeviceIdentity identity = identityService.current();
        UUID requestId = UUID.randomUUID();
        audit(
                "activation-" + requestId,
                ProAuditEventType.ACTIVATION_STARTED,
                requestId.toString(),
                "device",
                null,
                null,
                null,
                null,
                "started",
                null,
                identity.keyId(),
                identity.publicKeyFingerprint());
        ProControlPlaneClient.ActivationTicket ticket =
                controlPlaneClient.startActivation(activationCode, requestId);
        Instant now = clock.instant();
        if (ticket.expiresAt() == null || !ticket.expiresAt().isAfter(now)) {
            throw new ProEntitlementApiException(
                    "invalid_activation_ticket",
                    "The control plane returned an expired activation ticket.",
                    HttpStatus.BAD_GATEWAY);
        }
        UUID activationId = UUID.randomUUID();
        ActivationAttempt attempt = new ActivationAttempt(
                activationId,
                ticket.activationTicket(),
                now,
                ticket.expiresAt(),
                UUID.randomUUID().toString(),
                UUID.randomUUID());
        activationAttempts.put(activationId, attempt);
        return new ActivationStartResult(
                "1",
                activationId,
                ticket.expiresAt(),
                identity.publicKeyFingerprint(),
                "Activation code accepted. Complete device proof before the attempt expires.");
    }

    public ProStatusResponse completeActivation(UUID activationId) {
        if (activationId == null) {
            throw badRequest(
                    "activation_id_required",
                    "Activation attempt ID is required.");
        }
        ActivationAttempt attempt = activationAttempts.get(activationId);
        if (attempt == null) {
            throw badRequest(
                    "activation_attempt_not_found",
                    "Activation attempt is missing or expired. Start activation again.");
        }

        CompletableFuture<ProStatusResponse> future;
        boolean leader = false;
        synchronized (attempt) {
            future = attempt.inFlight;
            if (future == null) {
                future = new CompletableFuture<>();
                attempt.inFlight = future;
                leader = true;
            }
        }
        if (!leader) {
            return await(future);
        }

        try {
            ProStatusResponse result = completeActivationAttempt(attempt);
            synchronized (attempt) {
                if (result.entitlement().localUseAllowed()) {
                    activationAttempts.remove(attempt.activationId, attempt);
                    result = status(refreshInFlight.get() != null);
                } else {
                    attempt.inFlight = null;
                }
            }
            future.complete(result);
            return result;
        } catch (RuntimeException exception) {
            future.completeExceptionally(exception);
            synchronized (attempt) {
                attempt.inFlight = null;
            }
            throw exception;
        }
    }

    public ProStatusResponse refresh() {
        ProEntitlementCache cached = repository.load().orElse(null);
        if (cached != null && cached.deactivatedAt() != null) {
            return status(false);
        }

        while (true) {
            CompletableFuture<ProStatusResponse> existing = refreshInFlight.get();
            if (existing != null) {
                return await(existing);
            }
            CompletableFuture<ProStatusResponse> candidate = new CompletableFuture<>();
            if (!refreshInFlight.compareAndSet(null, candidate)) {
                continue;
            }
            try {
                ProStatusResponse result = performRefresh();
                candidate.complete(result);
                return result;
            } catch (RuntimeException exception) {
                candidate.completeExceptionally(exception);
                throw exception;
            } finally {
                refreshInFlight.compareAndSet(candidate, null);
            }
        }
    }

    public void refreshIfDue() {
        Optional<ProEntitlementCache> cached = repository.load();
        if (cached.isEmpty()
                || cached.get().deactivatedAt() != null
                || !cached.get().hasAssociationOrDocuments()) {
            return;
        }
        Instant nextAttempt = cached.get().nextRefreshAt();
        Instant now = clock.instant();
        if (nextAttempt == null || !now.isBefore(nextAttempt)) {
            refresh();
        }
    }

    public DeactivationResult deactivate(
            String confirmation,
            boolean acknowledgeModuleDataRetained,
            boolean acknowledgeAccountAssociationRetained) {
        if (!DEACTIVATION_CONFIRMATION.equals(confirmation)
                || !acknowledgeModuleDataRetained
                || !acknowledgeAccountAssociationRetained) {
            throw badRequest(
                    "deactivation_confirmation_required",
                    "Deactivation requires the exact confirmation phrase and both retention acknowledgements.");
        }
        Instant now = clock.instant();
        boolean entitlementExisted;
        synchronized (cacheMutationLock) {
            ProEntitlementCache current = repository.load()
                    .orElseGet(() -> ProEntitlementCache.empty(now));
            ProEntitlementState previous =
                    evaluateEntitlement(
                                    current,
                                    identityService.current(),
                                    now)
                            .state();
            UUID deactivationId = UUID.randomUUID();
            audit(
                    "deactivation-" + deactivationId,
                    ProAuditEventType.ENTITLEMENT_STATE_TRANSITION,
                    deactivationId.toString(),
                    "entitlement",
                    null,
                    null,
                    previous.name(),
                    ProEntitlementState.NOT_ACTIVATED.name(),
                    "completed",
                    "locally_deactivated",
                    null,
                    current.durableGrantFingerprint());
            entitlementExisted = current.hasAssociationOrDocuments();
            cacheGeneration++;
            repository.save(current.locallyDeactivated(now));
        }
        activationAttempts.clear();
        return new DeactivationResult(
                "1",
                true,
                entitlementExisted,
                true,
                false,
                false,
                false,
                "Autark Pro is disabled on this appliance. Local module data, the device identity, and the control-plane account association were retained.",
                now);
    }

    private ProStatusResponse completeActivationAttempt(ActivationAttempt attempt) {
        DeviceIdentity identity = identityService.current();
        ProControlPlaneClient.RegistrationResult registration;
        synchronized (attempt) {
            registration = attempt.registrationResult;
        }
        if (registration == null) {
            if (!attempt.expiresAt.isAfter(clock.instant())) {
                activationAttempts.remove(attempt.activationId, attempt);
                throw badRequest(
                        "activation_attempt_expired",
                        "Activation attempt expired. Start activation again.");
            }
            synchronized (attempt) {
                if (attempt.registrationRequest == null) {
                    UUID challengeRequestId = UUID.randomUUID();
                    ProControlPlaneClient.RegistrationChallenge challenge =
                            controlPlaneClient.createRegistrationChallenge(
                                    attempt.activationTicket,
                                    identity.deviceId(),
                                    challengeRequestId);
                    attempt.registrationRequest = registrationProofFactory.create(
                            attempt.idempotencyKey,
                            attempt.activationTicket,
                            challenge,
                            architecture,
                            coreVersion);
                }
                audit(
                        "registration-"
                                + attempt.registrationRequestId
                                + "-started",
                        ProAuditEventType.DEVICE_REGISTRATION,
                        attempt.activationId.toString(),
                        "device",
                        coreVersion,
                        null,
                        null,
                        null,
                        "started",
                        null,
                        identity.keyId(),
                        identity.publicKeyFingerprint());
                registration = controlPlaneClient.registerDevice(
                        attempt.registrationRequest,
                        attempt.registrationRequestId);
                if (!identity.deviceId().equals(registration.deviceId())) {
                    throw new ProEntitlementApiException(
                            "device_registration_mismatch",
                            "Control-plane registration belongs to another device.",
                            HttpStatus.BAD_GATEWAY);
                }
                audit(
                        "registration-"
                                + attempt.registrationRequestId
                                + "-completed",
                        ProAuditEventType.DEVICE_REGISTRATION,
                        attempt.activationId.toString(),
                        "device",
                        coreVersion,
                        null,
                        null,
                        null,
                        "completed",
                        "registered",
                        identity.keyId(),
                        identity.publicKeyFingerprint());
                attempt.registrationResult = registration;
                attempt.activationTicket = null;
                attempt.registrationRequest = null;
            }
        }

        associateRegistration(registration.registrationId());
        return refresh();
    }

    private void associateRegistration(UUID registrationId) {
        Instant now = clock.instant();
        synchronized (cacheMutationLock) {
            ProEntitlementCache current = repository.load()
                    .orElseGet(() -> ProEntitlementCache.empty(now));
            cacheGeneration++;
            repository.save(
                    current.associateRegistration(registrationId, now));
        }
    }

    private ProStatusResponse performRefresh() {
        Instant now = clock.instant();
        DeviceIdentity identity = identityService.current();
        UUID refreshId = UUID.randomUUID();
        ProEntitlementCache original;
        ProEntitlementCache attempted;
        ProEntitlementState previousState;
        long generation;
        synchronized (cacheMutationLock) {
            original = repository.load()
                    .orElseGet(() -> ProEntitlementCache.empty(now));
            if (original.deactivatedAt() != null) {
                return response(original, identity, false, now);
            }
            previousState =
                    evaluateEntitlement(original, identity, now).state();
            audit(
                    "refresh-" + refreshId + "-started",
                    ProAuditEventType.ENTITLEMENT_REFRESH,
                    refreshId.toString(),
                    "entitlement",
                    null,
                    null,
                    previousState.name(),
                    previousState.name(),
                    "started",
                    null,
                    null,
                    original.durableGrantFingerprint());
            generation = cacheGeneration;
            attempted = repository.save(original.beginRefresh(null, now));
        }

        try {
            ProControlPlaneClient.RegistrationChallenge challenge =
                    controlPlaneClient.createDeviceChallenge(
                            ProControlPlaneClient.ChallengePurpose.ENTITLEMENT_RENEW,
                            identity.deviceId(),
                            UUID.randomUUID());
            ProControlPlaneClient.DeviceProofRequest proof =
                    operationProofFactory.create(
                            ProControlPlaneClient.ChallengePurpose.ENTITLEMENT_RENEW,
                            challenge);
            ProControlPlaneClient.EntitlementDocuments documents =
                    controlPlaneClient.renewEntitlements(proof, UUID.randomUUID());
            GrantVerifier.VerifiedGrant grant =
                    grantVerifier.verify(documents.durableProductGrant(), identity);
            ServiceLeaseVerifier.VerifiedLease lease =
                    leaseVerifier.verify(
                            documents.onlineServiceLease(),
                            identity,
                            grant.grant());
            validateResponse(documents, grant, lease, original, identity);
            Instant nextAttempt = nextSuccessfulRefresh(now, lease);
            ProEntitlementStatus refreshedEntitlement = reducer.reduce(
                    grant,
                    lease,
                    identity,
                    now,
                    documents.serverTime(),
                    onlineGrace);
            audit(
                    "refresh-" + refreshId + "-state",
                    ProAuditEventType.ENTITLEMENT_STATE_TRANSITION,
                    refreshId.toString(),
                    "entitlement",
                    null,
                    null,
                    previousState.name(),
                    refreshedEntitlement.state().name(),
                    "recorded",
                    safeAuditReason(refreshedEntitlement.reasonCode()),
                    grant.keyId(),
                    grant.fingerprint());
            audit(
                    "refresh-" + refreshId + "-completed",
                    ProAuditEventType.ENTITLEMENT_REFRESH,
                    refreshId.toString(),
                    "entitlement",
                    null,
                    null,
                    previousState.name(),
                    refreshedEntitlement.state().name(),
                    "completed",
                    safeAuditReason(refreshedEntitlement.reasonCode()),
                    grant.keyId(),
                    grant.fingerprint());
            ProEntitlementCache saved;
            synchronized (cacheMutationLock) {
                if (cacheGeneration != generation) {
                    return status(false);
                }
                saved = repository.save(attempted.refreshSucceeded(
                        attempted.registrationId(),
                        documents.durableProductGrant(),
                        grant,
                        documents.onlineServiceLease(),
                        lease,
                        documents.serverTime(),
                        nextAttempt,
                        now));
            }
            return response(saved, identity, false, now);
        } catch (RuntimeException exception) {
            if (exception instanceof ProAuditException) {
                throw exception;
            }
            String category = failureCategory(exception);
            int failures = Math.min(30, attempted.consecutiveFailures() + 1);
            Instant nextAttempt = nextFailedRefresh(now, attempted, failures);
            audit(
                    "refresh-" + refreshId + "-failed",
                    ProAuditEventType.ENTITLEMENT_REFRESH,
                    refreshId.toString(),
                    "entitlement",
                    null,
                    null,
                    previousState.name(),
                    previousState.name(),
                    "failed",
                    category,
                    null,
                    original.durableGrantFingerprint());
            ProEntitlementCache failed;
            synchronized (cacheMutationLock) {
                if (cacheGeneration != generation) {
                    return status(false);
                }
                failed = repository.save(attempted.refreshFailed(
                        category,
                        failures,
                        nextAttempt,
                        now));
            }
            return response(failed, identity, false, now);
        }
    }

    private void validateResponse(
            ProControlPlaneClient.EntitlementDocuments documents,
            GrantVerifier.VerifiedGrant grant,
            ServiceLeaseVerifier.VerifiedLease lease,
            ProEntitlementCache cached,
            DeviceIdentity identity) {
        if (documents.serverTime() == null
                || !documents.serverTime().equals(lease.lease().serverTime())) {
            throw verificationFailure(
                    "server_time_mismatch",
                    "Verified service lease has inconsistent server time.");
        }
        if (cached.lastVerifiedServerTime() != null
                && documents.serverTime().isBefore(cached.lastVerifiedServerTime())) {
            throw verificationFailure(
                    "stale_server_time",
                    "Control plane returned an older verified server-time checkpoint.");
        }

        VerifiedCache previous = verifiedCacheForReplacement(cached, identity);
        if (previous.grant() != null) {
            if (grant.grant().issuedAt().isBefore(
                    previous.grant().grant().issuedAt())
                    || grant.grant().updatesThrough().isBefore(
                            previous.grant().grant().updatesThrough())
                    || (grant.grant().issuedAt().equals(
                                    previous.grant().grant().issuedAt())
                            && !grant.fingerprint().equals(
                                    previous.grant().fingerprint()))) {
                throw verificationFailure(
                        "stale_grant",
                        "Control plane returned an older or conflicting durable grant.");
            }
        }
        if (previous.lease() != null
                && (lease.lease().issuedAt().isBefore(
                                previous.lease().lease().issuedAt())
                        || (lease.lease().issuedAt().equals(
                                        previous.lease().lease().issuedAt())
                                && !lease.fingerprint().equals(
                                        previous.lease().fingerprint())))) {
            throw verificationFailure(
                    "stale_lease",
                    "Control plane returned an older or conflicting service lease.");
        }
    }

    private VerifiedCache verifyCache(
            ProEntitlementCache cache,
            DeviceIdentity identity) {
        if (cache == null || cache.durableGrantEnvelope() == null) {
            if (cache != null && cache.serviceLeaseEnvelope() != null) {
                throw verificationFailure(
                        "orphaned_lease",
                        "Cached service lease is missing its durable grant.");
            }
            return new VerifiedCache(null, null);
        }
        GrantVerifier.VerifiedGrant grant =
                grantVerifier.verify(cache.durableGrantEnvelope(), identity);
        requireGrantMetadata(cache, grant);
        if (cache.serviceLeaseEnvelope() == null) {
            return new VerifiedCache(grant, null);
        }
        ServiceLeaseVerifier.VerifiedLease lease =
                leaseVerifier.verify(
                        cache.serviceLeaseEnvelope(),
                        identity,
                        grant.grant());
        requireLeaseMetadata(cache, lease);
        return new VerifiedCache(grant, lease);
    }

    private VerifiedCache verifiedCacheForReplacement(
            ProEntitlementCache cache,
            DeviceIdentity identity) {
        if (cache == null || cache.durableGrantEnvelope() == null) {
            return new VerifiedCache(null, null);
        }
        GrantVerifier.VerifiedGrant grant;
        try {
            grant = grantVerifier.verify(
                    cache.durableGrantEnvelope(),
                    identity);
            requireGrantMetadata(cache, grant);
        } catch (RuntimeException exception) {
            return new VerifiedCache(null, null);
        }
        if (cache.serviceLeaseEnvelope() == null) {
            return new VerifiedCache(grant, null);
        }
        try {
            ServiceLeaseVerifier.VerifiedLease lease =
                    leaseVerifier.verify(
                            cache.serviceLeaseEnvelope(),
                            identity,
                            grant.grant());
            requireLeaseMetadata(cache, lease);
            return new VerifiedCache(grant, lease);
        } catch (RuntimeException exception) {
            return new VerifiedCache(grant, null);
        }
    }

    private ProStatusResponse status(boolean inProgress) {
        Instant now = clock.instant();
        DeviceIdentity identity;
        try {
            identity = identityService.current();
        } catch (RuntimeException exception) {
            return new ProStatusResponse(
                    "1",
                    reducer.internalError(null),
                    new ProStatusResponse.DeviceStatus("", "", "", false),
                    activationStatus(),
                    moduleStatus(reducer.internalError(null)),
                    new ProStatusResponse.RefreshStatus(
                            inProgress,
                            null,
                            null,
                            null,
                            "identity",
                            0));
        }
        try {
            ProEntitlementCache cached = repository.load().orElse(null);
            return response(cached, identity, inProgress, now);
        } catch (RuntimeException exception) {
            return new ProStatusResponse(
                    "1",
                    reducer.internalError(null),
                    deviceStatus(identity, false),
                    activationStatus(),
                    moduleStatus(reducer.internalError(null)),
                    new ProStatusResponse.RefreshStatus(
                            inProgress,
                            null,
                            null,
                            null,
                            "cache",
                            0));
        }
    }

    private ProStatusResponse response(
            ProEntitlementCache cached,
            DeviceIdentity identity,
            boolean inProgress,
            Instant now) {
        ProEntitlementStatus entitlement =
                evaluateEntitlement(cached, identity, now);
        auditEntitlementObservation(cached, entitlement);
        boolean registered = cached != null
                && cached.deactivatedAt() == null
                && cached.hasAssociationOrDocuments();
        return new ProStatusResponse(
                "1",
                entitlement,
                deviceStatus(identity, registered),
                activationStatus(),
                moduleStatus(entitlement),
                refreshStatus(cached, inProgress));
    }

    private ProEntitlementStatus evaluateEntitlement(
            ProEntitlementCache cached,
            DeviceIdentity identity,
            Instant now) {
        if (cached == null || cached.durableGrantEnvelope() == null) {
            return reducer.reduce(
                    null,
                    null,
                    identity,
                    now,
                    cached == null ? null : cached.lastVerifiedServerTime(),
                    onlineGrace);
        } else {
            GrantVerifier.VerifiedGrant grant;
            try {
                grant = grantVerifier.verify(
                        cached.durableGrantEnvelope(),
                        identity);
                requireGrantMetadata(cached, grant);
            } catch (RuntimeException exception) {
                grant = null;
            }
            if (grant == null) {
                return reducer.invalidGrant(
                        cached.lastVerifiedServerTime());
            } else if (cached.serviceLeaseEnvelope() == null) {
                return reducer.reduce(
                        grant,
                        null,
                        identity,
                        now,
                        cached.lastVerifiedServerTime(),
                        onlineGrace);
            } else {
                try {
                    ServiceLeaseVerifier.VerifiedLease lease =
                            leaseVerifier.verify(
                                    cached.serviceLeaseEnvelope(),
                                    identity,
                                    grant.grant());
                    requireLeaseMetadata(cached, lease);
                    return reducer.reduce(
                            grant,
                            lease,
                            identity,
                            now,
                            cached.lastVerifiedServerTime(),
                            onlineGrace);
                } catch (RuntimeException exception) {
                    return reducer.invalidLease(
                            grant,
                            identity,
                            now,
                            cached.lastVerifiedServerTime(),
                            onlineGrace);
                }
            }
        }
    }

    private void auditEntitlementObservation(
            ProEntitlementCache cached,
            ProEntitlementStatus entitlement) {
        if (audit == null) {
            return;
        }
        String authority = auditAuthority(
                entitlement.grantFingerprint());
        String checkpoint = entitlement.lastVerifiedServerTime() == null
                ? "none"
                : Long.toUnsignedString(
                        entitlement.lastVerifiedServerTime()
                                .getEpochSecond());
        String state = entitlement.state()
                .name()
                .toLowerCase(java.util.Locale.ROOT);
        audit(
                "entitlement-"
                        + authority
                        + "-"
                        + checkpoint
                        + "-"
                        + state,
                ProAuditEventType.ENTITLEMENT_STATE_TRANSITION,
                null,
                "entitlement",
                null,
                null,
                null,
                entitlement.state().name(),
                "recorded",
                safeAuditReason(entitlement.reasonCode()),
                cached == null
                        ? null
                        : cached.durableGrantKeyId(),
                entitlement.grantFingerprint());
        if (entitlement.state()
                == ProEntitlementState.RETAINED_USE) {
            audit(
                    "retained-"
                            + authority
                            + "-"
                            + checkpoint,
                    ProAuditEventType.RETAINED_USE,
                    null,
                    "entitlement",
                    null,
                    null,
                    null,
                    entitlement.state().name(),
                    "recorded",
                    safeAuditReason(entitlement.reasonCode()),
                    cached == null
                            ? null
                            : cached.durableGrantKeyId(),
                    entitlement.grantFingerprint());
        }
    }

    private static void requireGrantMetadata(
            ProEntitlementCache cache,
            GrantVerifier.VerifiedGrant grant) {
        if (!Objects.equals(
                        cache.durableGrantFingerprint(),
                        grant.fingerprint())
                || !Objects.equals(cache.durableGrantKeyId(), grant.keyId())
                || !Objects.equals(
                        cache.durableGrantIssuedAt(),
                        grant.grant().issuedAt())) {
            throw verificationFailure(
                    "cache_metadata_mismatch",
                    "Cached durable grant metadata does not match its signed document.");
        }
    }

    private static void requireLeaseMetadata(
            ProEntitlementCache cache,
            ServiceLeaseVerifier.VerifiedLease lease) {
        if (!Objects.equals(
                        cache.serviceLeaseFingerprint(),
                        lease.fingerprint())
                || !Objects.equals(cache.serviceLeaseKeyId(), lease.keyId())
                || !Objects.equals(
                        cache.serviceLeaseIssuedAt(),
                        lease.lease().issuedAt())) {
            throw verificationFailure(
                    "cache_metadata_mismatch",
                    "Cached service lease metadata does not match its signed document.");
        }
    }

    private Instant nextSuccessfulRefresh(
            Instant now,
            ServiceLeaseVerifier.VerifiedLease lease) {
        Instant earliest = maximum(
                lease.lease().renewAfter(),
                now.plus(Duration.ofMinutes(1)));
        long jitterBound = Math.max(
                0,
                Math.min(
                        renewalJitterMaximum.toMillis(),
                        Math.max(
                                0,
                                Duration.between(
                                                earliest,
                                                lease.lease().expiresAt())
                                        .toMillis()
                                        / 2)));
        Instant candidate = earliest.plusMillis(offset(jitterBound));
        Instant latest = lease.lease().expiresAt().minus(RENEWAL_SAFETY_MARGIN);
        if (latest.isAfter(now) && candidate.isAfter(latest)) {
            return latest;
        }
        return candidate;
    }

    private Instant nextFailedRefresh(
            Instant now,
            ProEntitlementCache cached,
            int failures) {
        int exponent = Math.min(20, Math.max(0, failures - 1));
        long multiplier = 1L << exponent;
        Duration exponential;
        try {
            exponential = retryBase.multipliedBy(multiplier);
        } catch (ArithmeticException exception) {
            exponential = retryMaximum;
        }
        Duration bounded = exponential.compareTo(retryMaximum) > 0
                ? retryMaximum
                : exponential;
        long jitterMaximum = Math.max(0, bounded.toMillis() / 5);
        Instant candidate =
                now.plus(bounded).plusMillis(offset(jitterMaximum));

        try {
            VerifiedCache verified = verifyCache(cached, identityService.current());
            if (verified.lease() != null) {
                Instant latest =
                        verified.lease().lease().expiresAt().minus(EXPIRY_SAFETY_MARGIN);
                if (latest.isAfter(now) && candidate.isAfter(latest)) {
                    candidate = latest;
                }
            }
        } catch (RuntimeException ignored) {
            // Invalid cached documents never influence renewal scheduling.
        }
        Instant minimum = now.plus(MINIMUM_RETRY_DELAY);
        return candidate.isBefore(minimum) ? minimum : candidate;
    }

    private long offset(long inclusiveMaximum) {
        if (inclusiveMaximum <= 0) {
            return 0;
        }
        long bound = inclusiveMaximum == Long.MAX_VALUE
                ? Long.MAX_VALUE
                : inclusiveMaximum + 1;
        long value = randomOffset.applyAsLong(bound);
        if (value < 0 || value >= bound) {
            throw new IllegalStateException("Pro renewal jitter source returned an invalid offset.");
        }
        return value;
    }

    private void cleanupActivationAttempts() {
        Instant now = clock.instant();
        activationAttempts.entrySet().removeIf(entry -> {
            ActivationAttempt attempt = entry.getValue();
            synchronized (attempt) {
                return !attempt.expiresAt.isAfter(now)
                        && (attempt.inFlight == null
                                || attempt.inFlight.isDone());
            }
        });
    }

    private static ProStatusResponse.DeviceStatus deviceStatus(
            DeviceIdentity identity,
            boolean registered) {
        return new ProStatusResponse.DeviceStatus(
                identity.deviceId(),
                identity.installationId(),
                identity.publicKeyFingerprint(),
                registered);
    }

    private ProStatusResponse.ActivationStatus activationStatus() {
        ActivationAttempt latest = activationAttempts.values().stream()
                .filter(attempt -> attempt.expiresAt.isAfter(clock.instant()))
                .max((left, right) -> left.startedAt.compareTo(right.startedAt))
                .orElse(null);
        if (latest == null) {
            return new ProStatusResponse.ActivationStatus(
                    "idle",
                    null,
                    null);
        }
        synchronized (latest) {
            boolean completing = latest.inFlight != null
                    && !latest.inFlight.isDone();
            return new ProStatusResponse.ActivationStatus(
                    completing ? "completing" : "ready_to_complete",
                    latest.activationId,
                    latest.expiresAt);
        }
    }

    private ProStatusResponse.ModuleStatus moduleStatus(
            ProEntitlementStatus entitlement) {
        try {
            return moduleStatusProvider.status(entitlement);
        } catch (RuntimeException exception) {
            return new ProStatusResponse.ModuleStatus(
                    ProModuleState.ERROR,
                    null,
                    null,
                    null,
                    "failed",
                    null,
                    "module_state_unavailable");
        }
    }

    private static ProStatusResponse.RefreshStatus refreshStatus(
            ProEntitlementCache cache,
            boolean inProgress) {
        return new ProStatusResponse.RefreshStatus(
                inProgress,
                cache == null ? null : cache.lastRefreshAttemptAt(),
                cache == null ? null : cache.lastRefreshSuccessAt(),
                cache == null ? null : cache.nextRefreshAt(),
                cache == null ? null : cache.lastFailureCategory(),
                cache == null ? 0 : cache.consecutiveFailures());
    }

    private static String failureCategory(RuntimeException exception) {
        if (exception instanceof ProControlPlaneException controlPlane) {
            String code = controlPlane.code();
            if (List.of(
                            "control_plane_unavailable",
                            "control_plane_interrupted")
                    .contains(code)) {
                return "network";
            }
            if (code != null && code.contains("rate")) {
                return "rate_limited";
            }
            if (code != null
                    && (code.contains("activation") || code.contains("code"))) {
                return "activation";
            }
            if (code != null
                    && (code.contains("device")
                            || code.contains("challenge")
                            || code.contains("proof"))) {
                return "authorization";
            }
            return "control_plane";
        }
        if (exception instanceof ProContractVerificationException) {
            return "verification";
        }
        if (exception instanceof DeviceIdentityException) {
            return "identity";
        }
        if (exception instanceof IllegalArgumentException) {
            return "local_configuration";
        }
        return "internal";
    }

    private static ProContractVerificationException verificationFailure(
            String code,
            String message) {
        return new ProContractVerificationException(code, message);
    }

    private static ProEntitlementApiException badRequest(
            String code,
            String message) {
        return new ProEntitlementApiException(code, message, HttpStatus.BAD_REQUEST);
    }

    private static <T> T await(CompletableFuture<T> future) {
        try {
            return future.get();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ProEntitlementApiException(
                    "local_request_interrupted",
                    "Local Pro request was interrupted.",
                    HttpStatus.SERVICE_UNAVAILABLE);
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new ProEntitlementApiException(
                    "local_request_failed",
                    "Local Pro request failed.",
                    HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    private static String resolveArchitecture(String configured) {
        if (configured != null && !configured.isBlank()) {
            return configured;
        }
        return System.getProperty("os.arch", "");
    }

    private static String requireArchitecture(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase();
        return switch (normalized) {
            case "linux/amd64", "amd64", "x86_64" -> "linux/amd64";
            case "linux/arm64", "arm64", "aarch64" -> "linux/arm64";
            default -> throw new IllegalStateException(
                    "Autark Pro requires a supported Linux architecture.");
        };
    }

    private static String requireCoreVersion(String value) {
        if (value == null
                || value.length() > 128
                || !value.matches(
                        "^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$")) {
            throw new IllegalStateException(
                    "Autark Pro core version must be a semantic version.");
        }
        return value;
    }

    private static Duration positive(Duration value, Duration fallback) {
        return value == null || value.isZero() || value.isNegative()
                ? fallback
                : value;
    }

    private static Duration nonNegative(Duration value) {
        return value == null || value.isNegative() ? Duration.ZERO : value;
    }

    private static Duration maximum(Duration first, Duration second) {
        return first.compareTo(second) >= 0 ? first : second;
    }

    private static Instant maximum(Instant first, Instant second) {
        return first.isAfter(second) ? first : second;
    }

    private void audit(
            String idempotencyKey,
            ProAuditEventType type,
            String correlationId,
            String component,
            String componentVersion,
            String digest,
            String fromState,
            String toState,
            String outcome,
            String reasonCode,
            String keyId,
            String fingerprint) {
        if (audit == null) {
            return;
        }
        audit.recordRequired(new ProAuditEvent(
                idempotencyKey,
                type,
                correlationId,
                component,
                componentVersion,
                digest,
                fromState,
                toState,
                outcome,
                reasonCode,
                keyId,
                fingerprint));
    }

    private static String safeAuditReason(String value) {
        return value != null
                        && value.matches(
                                "^[a-z][a-z0-9_]{0,63}$")
                ? value
                : null;
    }

    private static String auditAuthority(String fingerprint) {
        return fingerprint != null
                        && fingerprint.matches(
                                "^sha256:[0-9a-f]{64}$")
                ? fingerprint.substring(7, 19)
                : "none";
    }

    private record VerifiedCache(
            GrantVerifier.VerifiedGrant grant,
            ServiceLeaseVerifier.VerifiedLease lease) {
    }

    private static final class ActivationAttempt {

        private final UUID activationId;
        private String activationTicket;
        private final Instant startedAt;
        private final Instant expiresAt;
        private final String idempotencyKey;
        private final UUID registrationRequestId;
        private com.autarkos.pro.model.DeviceRegistrationRequest registrationRequest;
        private ProControlPlaneClient.RegistrationResult registrationResult;
        private CompletableFuture<ProStatusResponse> inFlight;

        private ActivationAttempt(
                UUID activationId,
                String activationTicket,
                Instant startedAt,
                Instant expiresAt,
                String idempotencyKey,
                UUID registrationRequestId) {
            this.activationId = activationId;
            this.activationTicket = activationTicket;
            this.startedAt = startedAt;
            this.expiresAt = expiresAt;
            this.idempotencyKey = idempotencyKey;
            this.registrationRequestId = registrationRequestId;
        }
    }

    public record ActivationStartResult(
            String schemaVersion,
            UUID activationId,
            Instant expiresAt,
            String publicKeyFingerprint,
            String message) {
    }

    public record DeactivationResult(
            String schemaVersion,
            boolean deactivated,
            boolean localEntitlementRemoved,
            boolean onlineAccessDisabled,
            boolean localModuleDataRemoved,
            boolean accountAssociationRemoved,
            boolean deviceIdentityRemoved,
            String message,
            Instant completedAt) {
    }
}
