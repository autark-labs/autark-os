package com.autarkos.pro.entitlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditEventType;
import com.autarkos.pro.audit.ProAuditException;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.controlplane.DeviceOperationProofFactory;
import com.autarkos.pro.controlplane.DeviceRegistrationProofFactory;
import com.autarkos.pro.controlplane.ProControlPlaneClient;
import com.autarkos.pro.controlplane.ProControlPlaneException;
import com.autarkos.pro.identity.DeviceChallengeSignature;
import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DeviceIdentityService;
import com.autarkos.pro.identity.DevicePublicKey;
import com.autarkos.pro.model.DeviceRegistrationRequest;
import com.autarkos.pro.model.DurableProductGrant;
import com.autarkos.pro.model.OnlineServiceLease;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProModuleState;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

class ProEntitlementServiceTests {

    private static final Instant ISSUED_AT =
            Instant.parse("2026-07-19T12:00:00Z");
    private static final Instant LOCAL_NOW =
            ISSUED_AT.plus(Duration.ofHours(1));
    private static final String DEVICE_ID =
            "11111111-1111-4111-8111-111111111111";
    private static final String INSTALLATION_ID =
            "22222222-2222-4222-8222-222222222222";
    private static final String DEVICE_FINGERPRINT =
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String KEY_ID = "test-entitlement-key";
    private static final ObjectMapper MAPPER =
            new ObjectMapper().registerModule(new JavaTimeModule());

    private KeyPair issuerKeyPair;
    private InMemoryRepository repository;
    private FakeControlPlane controlPlane;
    private FakeIdentityService identityService;
    private java.util.concurrent.ExecutorService executor;

    @BeforeEach
    void setUp() throws Exception {
        issuerKeyPair =
                KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        repository = new InMemoryRepository();
        identityService = new FakeIdentityService(identity());
        controlPlane = new FakeControlPlane(documents(ISSUED_AT, '3', '4'));
        executor = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    @Test
    void restoresVerifiedStateOfflineAndPreservesItAfterNetworkFailure() {
        ProEntitlementService first = service();

        ProStatusResponse activated = first.refresh();
        ProEntitlementCache validCache = repository.load().orElseThrow();

        assertThat(activated.entitlement().state())
                .isEqualTo(ProEntitlementState.ACTIVE);
        assertThat(validCache.durableGrantEnvelope()).isNotNull();
        assertThat(validCache.serviceLeaseEnvelope()).isNotNull();
        assertThat(validCache.nextRefreshAt())
                .isEqualTo(ISSUED_AT.plus(Duration.ofHours(12)));

        controlPlane.renewalFailure = new ProControlPlaneException(
                "control_plane_unavailable",
                "Control plane is unavailable.");
        ProEntitlementService restartedOffline = service();
        assertThat(restartedOffline.status().entitlement().state())
                .isEqualTo(ProEntitlementState.ACTIVE);

        ProStatusResponse failedRefresh = restartedOffline.refresh();
        ProEntitlementCache afterFailure = repository.load().orElseThrow();

        assertThat(failedRefresh.entitlement().state())
                .isEqualTo(ProEntitlementState.ACTIVE);
        assertThat(failedRefresh.refresh().lastFailureCategory())
                .isEqualTo("network");
        assertThat(afterFailure.durableGrantEnvelope())
                .isEqualTo(validCache.durableGrantEnvelope());
        assertThat(afterFailure.serviceLeaseEnvelope())
                .isEqualTo(validCache.serviceLeaseEnvelope());
        assertThat(afterFailure.nextRefreshAt())
                .isEqualTo(LOCAL_NOW.plus(Duration.ofMinutes(1)));
    }

    @Test
    void deduplicatesConcurrentRefreshRequests() throws Exception {
        ProEntitlementService service = service();
        controlPlane.prepareBlockedRenewal();

        var first = executor.submit(service::refresh);
        assertThat(controlPlane.renewalEntered.await(5, TimeUnit.SECONDS))
                .isTrue();
        var second = executor.submit(service::refresh);
        controlPlane.releaseRenewal.countDown();

        assertThat(first.get(5, TimeUnit.SECONDS).entitlement().state())
                .isEqualTo(ProEntitlementState.ACTIVE);
        assertThat(second.get(5, TimeUnit.SECONDS).entitlement().state())
                .isEqualTo(ProEntitlementState.ACTIVE);
        assertThat(controlPlane.renewCalls).hasValue(1);
        assertThat(controlPlane.operationChallengeCalls).hasValue(1);
    }

    @Test
    void rejectsOlderValidDocumentsWithoutReplacingCache() {
        ProEntitlementService service = service();
        service.refresh();
        ProEntitlementCache current = repository.load().orElseThrow();
        controlPlane.documents = documents(
                ISSUED_AT.minus(Duration.ofHours(1)),
                '5',
                '6');

        ProStatusResponse result = service.refresh();
        ProEntitlementCache retained = repository.load().orElseThrow();

        assertThat(result.entitlement().state())
                .isEqualTo(ProEntitlementState.ACTIVE);
        assertThat(result.refresh().lastFailureCategory())
                .isEqualTo("verification");
        assertThat(retained.durableGrantEnvelope())
                .isEqualTo(current.durableGrantEnvelope());
        assertThat(retained.serviceLeaseEnvelope())
                .isEqualTo(current.serviceLeaseEnvelope());
    }

    @Test
    void rejectsInvalidDocumentsWithoutReplacingVerifiedCache() {
        ProEntitlementService service = service();
        service.refresh();
        ProEntitlementCache current = repository.load().orElseThrow();
        var invalidGrant = new SignedEnvelopeV1(
                controlPlane.documents.durableProductGrant().payload(),
                controlPlane.documents.durableProductGrant().protectedHeader(),
                encode("invalid-signature".getBytes(StandardCharsets.UTF_8)));
        controlPlane.documents = new ProControlPlaneClient.EntitlementDocuments(
                "1",
                invalidGrant,
                controlPlane.documents.onlineServiceLease(),
                controlPlane.documents.serverTime(),
                UUID.randomUUID());

        ProStatusResponse result = service.refresh();
        ProEntitlementCache retained = repository.load().orElseThrow();

        assertThat(result.refresh().lastFailureCategory())
                .isEqualTo("verification");
        assertThat(retained.durableGrantEnvelope())
                .isEqualTo(current.durableGrantEnvelope());
        assertThat(retained.serviceLeaseEnvelope())
                .isEqualTo(current.serviceLeaseEnvelope());
    }

    @Test
    void failedRenewalsUseBoundedExponentialBackoff() {
        controlPlane.renewalFailure = new ProControlPlaneException(
                "control_plane_unavailable",
                "Control plane is unavailable.");
        ProEntitlementService service = service();

        for (int attempt = 0; attempt < 8; attempt++) {
            service.refresh();
        }

        ProEntitlementCache failed = repository.load().orElseThrow();
        assertThat(failed.consecutiveFailures()).isEqualTo(8);
        assertThat(failed.nextRefreshAt())
                .isEqualTo(LOCAL_NOW.plus(Duration.ofHours(1)));
    }

    @Test
    void activationKeepsTicketOutOfPersistenceAndCompletesDeviceProof() {
        ProEntitlementService service = service();

        var started = service.startActivation("AUTARK-PRO-ONE-TIME-CODE");
        ProStatusResponse resumable = service.status();

        assertThat(repository.load()).isEmpty();
        assertThat(started.activationId()).isNotNull();
        assertThat(started.toString())
                .doesNotContain("AUTARK-PRO-ONE-TIME-CODE")
                .doesNotContain("opaque-activation-ticket");
        assertThat(resumable.activation().state())
                .isEqualTo("ready_to_complete");
        assertThat(resumable.activation().activationId())
                .isEqualTo(started.activationId());
        assertThat(resumable.activation().expiresAt())
                .isEqualTo(started.expiresAt());
        assertThat(resumable.module().state())
                .isEqualTo(ProModuleState.NOT_INSTALLED);

        ProStatusResponse completed =
                service.completeActivation(started.activationId());

        assertThat(completed.entitlement().state())
                .isEqualTo(ProEntitlementState.ACTIVE);
        assertThat(completed.device().registered()).isTrue();
        assertThat(completed.activation().state()).isEqualTo("idle");
        assertThat(completed.activation().activationId()).isNull();
        assertThat(repository.load().orElseThrow().registrationId())
                .isEqualTo(FakeControlPlane.REGISTRATION_ID);
        assertThat(controlPlane.registerCalls).hasValue(1);
    }

    @Test
    void activationAndEntitlementLifecycleUseStructuredSafeAuditEvents() {
        ProAuditService audit = mock(ProAuditService.class);
        List<ProAuditEvent> events = new ArrayList<>();
        doAnswer(invocation -> {
            events.add(invocation.getArgument(0));
            return null;
        }).when(audit).recordRequired(any(ProAuditEvent.class));
        ProEntitlementService service = service(audit);

        var started =
                service.startActivation(
                        "AUTARK-PRO-ONE-TIME-CODE");
        service.completeActivation(started.activationId());

        assertThat(events)
                .extracting(ProAuditEvent::type)
                .contains(
                        ProAuditEventType.ACTIVATION_STARTED,
                        ProAuditEventType.DEVICE_REGISTRATION,
                        ProAuditEventType.ENTITLEMENT_REFRESH,
                        ProAuditEventType.ENTITLEMENT_STATE_TRANSITION);
        assertThat(events)
                .allSatisfy(event ->
                        assertThat(event.toString())
                                .doesNotContain(
                                        "AUTARK-PRO-ONE-TIME-CODE",
                                        "opaque-activation-ticket",
                                        "nonce-that-is-safe-for-tests",
                                        "test-signature"));
        assertThat(events.stream()
                        .filter(event ->
                                event.type()
                                        == ProAuditEventType.ENTITLEMENT_REFRESH)
                        .map(ProAuditEvent::outcome)
                        .toList())
                .contains("started", "completed");
    }

    @Test
    void requiredAuditFailureStopsActivationAndRefreshBeforeRemoteCalls() {
        ProAuditService audit = mock(ProAuditService.class);
        doThrow(new ProAuditException(
                        new IllegalStateException("audit unavailable")))
                .when(audit)
                .recordRequired(any(ProAuditEvent.class));
        ProEntitlementService service = service(audit);

        assertThatThrownBy(() ->
                service.startActivation(
                        "AUTARK-PRO-ONE-TIME-CODE"))
                .isInstanceOf(ProAuditException.class);
        assertThat(controlPlane.activationCalls).hasValue(0);

        assertThatThrownBy(service::refresh)
                .isInstanceOf(ProAuditException.class);
        assertThat(controlPlane.renewCalls).hasValue(0);
        assertThat(repository.load()).isEmpty();
    }

    @Test
    void pageRefreshObservesBackendOwnedActivationProgress() throws Exception {
        ProEntitlementService service = service();
        var started = service.startActivation("AUTARK-PRO-ONE-TIME-CODE");
        controlPlane.prepareBlockedRenewal();

        var completion = executor.submit(
                () -> service.completeActivation(started.activationId()));
        assertThat(controlPlane.renewalEntered.await(5, TimeUnit.SECONDS))
                .isTrue();

        ProStatusResponse inProgress = service.status();
        assertThat(inProgress.activation().state()).isEqualTo("completing");
        assertThat(inProgress.activation().activationId())
                .isEqualTo(started.activationId());

        controlPlane.releaseRenewal.countDown();
        assertThat(completion.get(5, TimeUnit.SECONDS).activation().state())
                .isEqualTo("idle");
    }

    @Test
    void localDeactivationRequiresAcknowledgementAndBlocksSilentRefresh() {
        ProEntitlementService service = service();
        service.refresh();
        int callsBefore = controlPlane.renewCalls.get();

        assertThatThrownBy(() -> service.deactivate(
                        "wrong-confirmation",
                        true,
                        true))
                .isInstanceOf(ProEntitlementApiException.class);

        var result = service.deactivate(
                ProEntitlementService.DEACTIVATION_CONFIRMATION,
                true,
                true);
        ProStatusResponse status = service.refresh();

        assertThat(result.localEntitlementRemoved()).isTrue();
        assertThat(result.onlineAccessDisabled()).isTrue();
        assertThat(result.localModuleDataRemoved()).isFalse();
        assertThat(result.accountAssociationRemoved()).isFalse();
        assertThat(result.deviceIdentityRemoved()).isFalse();
        assertThat(status.entitlement().state())
                .isEqualTo(ProEntitlementState.NOT_ACTIVATED);
        assertThat(status.device().registered()).isFalse();
        assertThat(controlPlane.renewCalls).hasValue(callsBefore);
        assertThat(repository.load().orElseThrow().deactivatedAt())
                .isEqualTo(LOCAL_NOW);
    }

    @Test
    void deactivationWinsAgainstAnAlreadyInFlightRenewal() throws Exception {
        ProEntitlementService service = service();
        service.refresh();
        controlPlane.prepareBlockedRenewal();
        var renewal = executor.submit(service::refresh);
        assertThat(controlPlane.renewalEntered.await(5, TimeUnit.SECONDS))
                .isTrue();

        service.deactivate(
                ProEntitlementService.DEACTIVATION_CONFIRMATION,
                true,
                true);
        controlPlane.releaseRenewal.countDown();
        renewal.get(5, TimeUnit.SECONDS);

        ProEntitlementCache retained = repository.load().orElseThrow();
        assertThat(retained.deactivatedAt()).isEqualTo(LOCAL_NOW);
        assertThat(retained.durableGrantEnvelope()).isNull();
        assertThat(retained.serviceLeaseEnvelope()).isNull();
        assertThat(service.status().entitlement().state())
                .isEqualTo(ProEntitlementState.NOT_ACTIVATED);
    }

    private ProEntitlementService service() {
        return service(null);
    }

    private ProEntitlementService service(
            ProAuditService audit) {
        ProTrustStore trustStore = new ProTrustStore() {
            @Override
            public PublicKey verificationKey(String requestedKeyId) {
                if (!KEY_ID.equals(requestedKeyId)) {
                    throw new IllegalArgumentException("unknown key");
                }
                return issuerKeyPair.getPublic();
            }

            @Override
            public Set<String> keyIds() {
                return Set.of(KEY_ID);
            }
        };
        return new ProEntitlementService(
                repository,
                controlPlane,
                identityService,
                new DeviceRegistrationProofFactory(identityService),
                new DeviceOperationProofFactory(identityService),
                new GrantVerifier(trustStore),
                new ServiceLeaseVerifier(trustStore),
                new ProEntitlementStateReducer(),
                audit,
                Clock.fixed(LOCAL_NOW, ZoneOffset.UTC),
                bound -> 0,
                Duration.ofDays(14),
                Duration.ofMinutes(1),
                Duration.ofHours(1),
                Duration.ofMinutes(30),
                "linux/amd64",
                "1.2.3");
    }

    private ProControlPlaneClient.EntitlementDocuments documents(
            Instant issuedAt,
            char grantIdDigit,
            char leaseIdDigit) {
        try {
            String grantId = uuid(grantIdDigit);
            DurableProductGrant grant = new DurableProductGrant(
                    "1",
                    grantId,
                    DEVICE_ID,
                    INSTALLATION_ID,
                    DEVICE_FINGERPRINT,
                    "pro_home",
                    List.of("autark-pro.extension"),
                    "staging",
                    "autark-pro-test",
                    issuedAt,
                    issuedAt.plus(Duration.ofDays(365 * 3L)),
                    "perpetual",
                    KEY_ID);
            OnlineServiceLease lease = new OnlineServiceLease(
                    "1",
                    uuid(leaseIdDigit),
                    grantId,
                    DEVICE_ID,
                    DEVICE_FINGERPRINT,
                    grant.features(),
                    List.of(
                            "release-check",
                            "registry",
                            "compatibility-feed"),
                    "active",
                    "autark-pro-test",
                    issuedAt,
                    issuedAt.plus(Duration.ofHours(12)),
                    issuedAt.plus(Duration.ofHours(24)),
                    issuedAt,
                    KEY_ID);
            return new ProControlPlaneClient.EntitlementDocuments(
                    "1",
                    sign(grant, GrantVerifier.DOCUMENT_TYPE),
                    sign(lease, ServiceLeaseVerifier.DOCUMENT_TYPE),
                    issuedAt,
                    UUID.randomUUID());
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private SignedEnvelopeV1 sign(Object payload, String type)
            throws Exception {
        String protectedHeader = encode(MAPPER.writeValueAsBytes(
                new ProtectedHeader("EdDSA", KEY_ID, type)));
        String encodedPayload = encode(MAPPER.writeValueAsBytes(payload));
        Signature signer = Signature.getInstance("Ed25519");
        signer.initSign(issuerKeyPair.getPrivate());
        signer.update((protectedHeader + "." + encodedPayload)
                .getBytes(StandardCharsets.US_ASCII));
        return new SignedEnvelopeV1(
                encodedPayload,
                protectedHeader,
                encode(signer.sign()));
    }

    private static String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static String uuid(char first) {
        return first
                + "3333333-3333-4333-8333-333333333333";
    }

    private static DeviceIdentity identity() {
        return new DeviceIdentity(
                "1",
                DEVICE_ID,
                INSTALLATION_ID,
                "Ed25519",
                "device-test-key",
                new DevicePublicKey(
                        "OKP",
                        "Ed25519",
                        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
                DEVICE_FINGERPRINT,
                ISSUED_AT,
                ISSUED_AT);
    }

    private record ProtectedHeader(String alg, String kid, String typ) {
    }

    private static final class InMemoryRepository
            implements ProEntitlementRepository {

        private ProEntitlementCache value;

        @Override
        public synchronized Optional<ProEntitlementCache> load() {
            return Optional.ofNullable(value);
        }

        @Override
        public synchronized ProEntitlementCache save(
                ProEntitlementCache cache) {
            value = cache;
            return cache;
        }
    }

    private static final class FakeIdentityService
            implements DeviceIdentityService {

        private final DeviceIdentity identity;

        private FakeIdentityService(DeviceIdentity identity) {
            this.identity = identity;
        }

        @Override
        public DeviceIdentity current() {
            return identity;
        }

        @Override
        public DeviceChallengeSignature signChallenge(byte[] challenge) {
            return new DeviceChallengeSignature(
                    "Ed25519",
                    identity.keyId(),
                    encode("test-signature".getBytes(StandardCharsets.UTF_8)));
        }

        @Override
        public DeviceIdentity rotateInstallationIdentity(
                String confirmation) {
            return identity;
        }
    }

    private static final class FakeControlPlane
            implements ProControlPlaneClient {

        private static final UUID REGISTRATION_ID =
                UUID.fromString("77777777-7777-4777-8777-777777777777");

        private final AtomicInteger renewCalls = new AtomicInteger();
        private final AtomicInteger activationCalls =
                new AtomicInteger();
        private final AtomicInteger operationChallengeCalls =
                new AtomicInteger();
        private final AtomicInteger registerCalls = new AtomicInteger();
        private volatile CountDownLatch renewalEntered =
                new CountDownLatch(1);
        private volatile CountDownLatch releaseRenewal =
                new CountDownLatch(1);
        private volatile EntitlementDocuments documents;
        private volatile RuntimeException renewalFailure;
        private volatile boolean blockRenewal;

        private FakeControlPlane(EntitlementDocuments documents) {
            this.documents = documents;
        }

        private void prepareBlockedRenewal() {
            renewalEntered = new CountDownLatch(1);
            releaseRenewal = new CountDownLatch(1);
            blockRenewal = true;
        }

        @Override
        public ActivationTicket startActivation(
                String activationCode,
                UUID requestId) {
            activationCalls.incrementAndGet();
            return new ActivationTicket(
                    "1",
                    "opaque-activation-ticket",
                    LOCAL_NOW.plus(Duration.ofMinutes(10)),
                    requestId);
        }

        @Override
        public RegistrationChallenge createRegistrationChallenge(
                String activationTicket,
                String deviceId,
                UUID requestId) {
            return challenge(requestId);
        }

        @Override
        public RegistrationChallenge createDeviceChallenge(
                ChallengePurpose purpose,
                String deviceId,
                UUID requestId) {
            operationChallengeCalls.incrementAndGet();
            return challenge(requestId);
        }

        @Override
        public RegistrationResult registerDevice(
                DeviceRegistrationRequest request,
                UUID requestId) {
            registerCalls.incrementAndGet();
            return new RegistrationResult(
                    "1",
                    REGISTRATION_ID,
                    DEVICE_ID,
                    "/entitlements/renew",
                    requestId);
        }

        @Override
        public EntitlementDocuments renewEntitlements(
                DeviceProofRequest request,
                UUID requestId) {
            renewCalls.incrementAndGet();
            CountDownLatch entered = renewalEntered;
            CountDownLatch release = releaseRenewal;
            entered.countDown();
            if (blockRenewal) {
                try {
                    if (!release.await(5, TimeUnit.SECONDS)) {
                        throw new IllegalStateException(
                                "test renewal was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
            }
            if (renewalFailure != null) {
                throw renewalFailure;
            }
            EntitlementDocuments current = documents;
            return new EntitlementDocuments(
                    current.schemaVersion(),
                    current.durableProductGrant(),
                    current.onlineServiceLease(),
                    current.serverTime(),
                    requestId);
        }

        @Override
        public ReleaseCheckResult checkRelease(
                DeviceProofRequest request,
                UUID requestId) {
            return new ReleaseCheckResult(
                    "1",
                    null,
                    LOCAL_NOW,
                    requestId);
        }

        @Override
        public RegistryCredentialResponse issueRegistryCredential(
                RegistryCredentialRequest request,
                UUID requestId) {
            throw new UnsupportedOperationException(
                    "Registry credentials are not used by entitlement tests.");
        }

        private RegistrationChallenge challenge(UUID requestId) {
            return new RegistrationChallenge(
                    "1",
                    "nonce-that-is-safe-for-tests",
                    LOCAL_NOW,
                    LOCAL_NOW.plus(Duration.ofMinutes(5)),
                    requestId);
        }
    }
}
