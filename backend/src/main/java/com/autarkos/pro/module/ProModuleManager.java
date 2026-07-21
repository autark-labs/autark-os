package com.autarkos.pro.module;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditEventType;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.controlplane.DeviceOperationProofFactory;
import com.autarkos.pro.controlplane.ProControlPlaneClient;
import com.autarkos.pro.controlplane.ProControlPlaneException;
import com.autarkos.pro.entitlement.ProStatusResponse;
import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DeviceIdentityService;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.model.ProModuleState;
import com.autarkos.pro.release.ReleaseManifestVerifier;
import com.autarkos.pro.release.ReleaseStateRepository;

@Service
public class ProModuleManager implements ProModuleStatusProvider {

    static final String JOB_TYPE = "pro_module_change";
    static final String JOB_SUBJECT = "autark-pro-agent";
    private static final Pattern ERROR_CODE =
            Pattern.compile("^[a-z][a-z0-9_]{1,63}$");
    private static final List<ProModuleState> IN_PROGRESS = List.of(
            ProModuleState.DOWNLOADING,
            ProModuleState.VERIFYING,
            ProModuleState.STARTING_CANDIDATE,
            ProModuleState.HEALTH_CHECKING,
            ProModuleState.ROLLING_BACK,
            ProModuleState.REMOVING);
    private static final ProModuleRuntime UNAVAILABLE_RUNTIME =
            new ProModuleRuntime() {
                @Override
                public void download(ProModuleCandidate candidate) {
                    unavailable();
                }

                @Override
                public void verifyImage(ProModuleCandidate candidate) {
                    unavailable();
                }

                @Override
                public void startCandidate(ProModuleCandidate candidate) {
                    unavailable();
                }

                @Override
                public HealthResult healthCheck(ProModuleCandidate candidate) {
                    unavailable();
                    return new HealthResult(false, "runtime_unavailable");
                }

                @Override
                public void activateCandidate(ProModuleCandidate candidate) {
                    unavailable();
                }

                @Override
                public HealthResult activeHealth(String activeDigest) {
                    unavailable();
                    return new HealthResult(
                            false,
                            "runtime_unavailable");
                }

                @Override
                public void reconcileRouting(String activeDigest) {
                    if (activeDigest != null) {
                        unavailable();
                    }
                }

                @Override
                public void discardCandidate(String candidateDigest) {
                    unavailable();
                }

                @Override
                public void discardPrevious(
                        String activeDigest,
                        String previousDigest) {
                    unavailable();
                }

                @Override
                public void rollback(
                        String activeDigest,
                        String previousDigest,
                        String candidateDigest) {
                    unavailable();
                }

                @Override
                public void remove(
                        String activeDigest,
                        String previousDigest) {
                    unavailable();
                }

                private void unavailable() {
                    throw new ProModuleException(
                            "module_runtime_unavailable",
                            "Autark Pro module runtime is not available.");
                }
            };

    private final ProModuleRepository repository;
    private final ProModuleTransitionPolicy transitions;
    private final AutarkOsJobService jobService;
    private final ProControlPlaneClient controlPlaneClient;
    private final DeviceIdentityService identityService;
    private final DeviceOperationProofFactory proofFactory;
    private final ReleaseManifestVerifier manifestVerifier;
    private final ProAuditService audit;
    private final ProModuleRuntime runtime;
    private final Clock clock;
    private final String architecture;
    private final String coreVersion;
    private final int agentApiMajor;
    private final Duration rollbackRetention;
    private final ReentrantLock operationLock = new ReentrantLock();
    private volatile ProModuleSnapshot fallbackState;
    private String monitoredDigest;
    private int consecutiveActiveFailures;

    @Autowired
    public ProModuleManager(
            ProModuleRepository repository,
            ProModuleTransitionPolicy transitions,
            AutarkOsJobService jobService,
            ProControlPlaneClient controlPlaneClient,
            DeviceIdentityService identityService,
            DeviceOperationProofFactory proofFactory,
            ReleaseManifestVerifier manifestVerifier,
            ProAuditService audit,
            ObjectProvider<ProModuleRuntime> runtimeProvider,
            @Value("${autark.pro.architecture:}")
                    String configuredArchitecture,
            @Value("${autark.pro.core-version:${AUTARK_OS_VERSION:0.0.1-SNAPSHOT}}")
                    String coreVersion,
            @Value("${autark.pro.agent-api-major:1}") int agentApiMajor,
            @Value("${autark.pro.rollback-retention:168h}")
                    Duration rollbackRetention) {
        this(
                repository,
                transitions,
                jobService,
                controlPlaneClient,
                identityService,
                proofFactory,
                manifestVerifier,
                audit,
                runtimeProvider.getIfAvailable(() -> UNAVAILABLE_RUNTIME),
                Clock.systemUTC(),
                resolveArchitecture(configuredArchitecture),
                coreVersion,
                agentApiMajor,
                rollbackRetention);
    }

    ProModuleManager(
            ProModuleRepository repository,
            ProModuleTransitionPolicy transitions,
            AutarkOsJobService jobService,
            ProControlPlaneClient controlPlaneClient,
            DeviceIdentityService identityService,
            DeviceOperationProofFactory proofFactory,
            ReleaseManifestVerifier manifestVerifier,
            ProModuleRuntime runtime,
            Clock clock,
            String architecture,
            String coreVersion,
            int agentApiMajor) {
        this(
                repository,
                transitions,
                jobService,
                controlPlaneClient,
                identityService,
                proofFactory,
                manifestVerifier,
                null,
                runtime,
                clock,
                architecture,
                coreVersion,
                agentApiMajor,
                Duration.ofDays(7));
    }

    ProModuleManager(
            ProModuleRepository repository,
            ProModuleTransitionPolicy transitions,
            AutarkOsJobService jobService,
            ProControlPlaneClient controlPlaneClient,
            DeviceIdentityService identityService,
            DeviceOperationProofFactory proofFactory,
            ReleaseManifestVerifier manifestVerifier,
            ProModuleRuntime runtime,
            Clock clock,
            String architecture,
            String coreVersion,
            int agentApiMajor,
            Duration rollbackRetention) {
        this(
                repository,
                transitions,
                jobService,
                controlPlaneClient,
                identityService,
                proofFactory,
                manifestVerifier,
                null,
                runtime,
                clock,
                architecture,
                coreVersion,
                agentApiMajor,
                rollbackRetention);
    }

    ProModuleManager(
            ProModuleRepository repository,
            ProModuleTransitionPolicy transitions,
            AutarkOsJobService jobService,
            ProControlPlaneClient controlPlaneClient,
            DeviceIdentityService identityService,
            DeviceOperationProofFactory proofFactory,
            ReleaseManifestVerifier manifestVerifier,
            ProAuditService audit,
            ProModuleRuntime runtime,
            Clock clock,
            String architecture,
            String coreVersion,
            int agentApiMajor,
            Duration rollbackRetention) {
        this.repository = Objects.requireNonNull(repository);
        this.transitions = Objects.requireNonNull(transitions);
        this.jobService = Objects.requireNonNull(jobService);
        this.controlPlaneClient = Objects.requireNonNull(controlPlaneClient);
        this.identityService = Objects.requireNonNull(identityService);
        this.proofFactory = Objects.requireNonNull(proofFactory);
        this.manifestVerifier = Objects.requireNonNull(manifestVerifier);
        this.audit = audit;
        this.runtime = Objects.requireNonNull(runtime);
        this.clock = Objects.requireNonNull(clock);
        this.architecture = requireArchitecture(architecture);
        this.coreVersion = requireCoreVersion(coreVersion);
        if (agentApiMajor < 1) {
            throw new IllegalArgumentException(
                    "Agent API major must be positive.");
        }
        this.agentApiMajor = agentApiMajor;
        this.rollbackRetention = requireRollbackRetention(
                rollbackRetention);
        this.fallbackState = ProModuleSnapshot.notInstalled(clock.instant());
    }

    public AutarkOsJob checkForRelease(
            ProModuleAuthorization authorization) {
        requireUpdates(authorization);
        return jobService.startWithJob(
                JOB_TYPE,
                JOB_SUBJECT,
                checkSteps(),
                job -> runCheck(job, authorization));
    }

    public AutarkOsJob installOrUpdate(
            ProModuleAuthorization authorization) {
        requireUpdates(authorization);
        return jobService.startWithJob(
                JOB_TYPE,
                JOB_SUBJECT,
                installSteps(),
                job -> runInstall(job, authorization));
    }

    public AutarkOsJob remove() {
        return jobService.startWithJob(
                JOB_TYPE,
                JOB_SUBJECT,
                removeSteps(),
                this::runRemove);
    }

    @Override
    public ProStatusResponse.ModuleStatus status(
            ProEntitlementStatus entitlement) {
        operationLock.lock();
        try {
            ProModuleSnapshot snapshot = safeLoad();
            snapshot = reconcileEntitlement(snapshot, entitlement);
            return toStatus(snapshot);
        } finally {
            operationLock.unlock();
        }
    }

    public ProStatusResponse.ModuleStatus status() {
        operationLock.lock();
        try {
            return toStatus(safeLoad());
        } finally {
            operationLock.unlock();
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverOnStartup() {
        try {
            recoverInterruptedState();
        } catch (RuntimeException ignored) {
            // CE startup must not depend on optional Pro recovery.
        }
    }

    public ProModuleSnapshot recoverInterruptedState() {
        operationLock.lock();
        try {
            ProModuleSnapshot snapshot = safeLoad();
            try {
                ProModuleSnapshot recovered = switch (snapshot.state()) {
                    case DOWNLOADING, VERIFYING ->
                            unwindDownload(snapshot);
                    case STARTING_CANDIDATE, HEALTH_CHECKING ->
                            recoverCandidate(snapshot);
                    case ROLLING_BACK -> finishRollback(snapshot);
                    case REMOVING -> finishRemoval(snapshot);
                    default -> snapshot;
                };
                runtime.reconcileRouting(
                        recovered.activeDigest());
                return recovered;
            } catch (RuntimeException exception) {
                if (snapshot.activeDigest() != null
                        && List.of(
                                        ProModuleState.ACTIVE,
                                        ProModuleState.DEGRADED,
                                        ProModuleState.RETAINED_USE)
                                .contains(snapshot.state())) {
                    return persistDegraded(
                            snapshot,
                            "routing_reconciliation_failed");
                }
                return persistFailure(
                        safeLoad(),
                        "module_recovery_failed",
                        "Autark Pro module recovery needs attention.");
            }
        } finally {
            operationLock.unlock();
        }
    }

    @Scheduled(
            initialDelayString =
                    "${autark.pro.agent-monitor-initial-delay:30s}",
            fixedDelayString =
                    "${autark.pro.agent-monitor-interval:30s}")
    public void monitorActiveRuntime() {
        if (!operationLock.tryLock()) {
            return;
        }
        try {
            ProModuleSnapshot snapshot = safeLoad();
            if (snapshot.activeDigest() == null
                    || !List.of(
                                    ProModuleState.ACTIVE,
                                    ProModuleState.DEGRADED,
                                    ProModuleState.RETAINED_USE)
                            .contains(snapshot.state())) {
                resetActiveFailures(null);
                return;
            }
            if (!snapshot.activeDigest().equals(monitoredDigest)) {
                resetActiveFailures(snapshot.activeDigest());
            }
            ProModuleRuntime.HealthResult health =
                    runtime.activeHealth(snapshot.activeDigest());
            if (health != null && health.healthy()) {
                runtime.reconcileRouting(
                        snapshot.activeDigest());
                consecutiveActiveFailures = 0;
                snapshot = discardExpiredPrevious(snapshot);
                ProModuleState next =
                        snapshot.state() == ProModuleState.DEGRADED
                                ? ProModuleState.ACTIVE
                                : snapshot.state();
                if (next == snapshot.state()
                        && "healthy".equals(snapshot.health())
                        && "healthy".equals(
                                snapshot.lastHealthResult())) {
                    return;
                }
                transition(
                        snapshot,
                        next,
                        null,
                        snapshot.jobId(),
                        "healthy",
                        safeReason(health.reasonCode()));
                return;
            }

            consecutiveActiveFailures++;
            String reason = health == null
                    ? "health_unavailable"
                    : safeReason(health.reasonCode());
            if (consecutiveActiveFailures >= 3
                    && snapshot.previousDigest() != null) {
                rollbackActiveRuntime(snapshot, reason);
                return;
            }
            persistDegraded(snapshot, reason);
        } catch (RuntimeException exception) {
            ProModuleSnapshot snapshot = safeLoad();
            if (snapshot.activeDigest() != null) {
                persistDegraded(
                        snapshot,
                        "active_health_check_failed");
            }
        } finally {
            operationLock.unlock();
        }
    }

    private AutarkOsJobOutcome runCheck(
            AutarkOsJob job,
            ProModuleAuthorization authorization) {
        operationLock.lock();
        Progress progress = new Progress(job, checkSteps());
        try {
            ProModuleSnapshot snapshot = prepareOperation(
                    safeLoad(),
                    "check",
                    job.jobId());
            progress.begin("check_release", "Checking assigned release.");
            ProModuleCandidate candidate =
                    checkAssignedRelease(authorization);
            progress.succeed("check_release", "Release assignment checked.");
            progress.begin("verify_manifest", "Verifying signed release.");
            if (candidate == null) {
                progress.succeed(
                        "verify_manifest",
                        "No release is currently assigned.");
                clearUnassignedCandidate(snapshot, job.jobId());
                return AutarkOsJobOutcome.succeeded(
                        "No Autark Pro update is currently assigned.",
                        progress.steps());
            }
            snapshot = acceptCandidate(snapshot, candidate, job.jobId());
            progress.succeed(
                    "verify_manifest",
                    snapshot.candidateDigest() == null
                            ? "The active release is already current."
                            : "The assigned release is verified and ready.");
            return AutarkOsJobOutcome.succeeded(
                    snapshot.candidateDigest() == null
                            ? "Autark Pro is already current."
                            : "An Autark Pro release is ready to install.",
                    progress.steps());
        } catch (RuntimeException exception) {
            persistFailure(
                    safeLoad(),
                    errorCode(exception),
                    "Autark Pro could not check for a release.");
            return AutarkOsJobOutcome.failed(
                    "Autark Pro could not check for a release.",
                    progress.failCurrent(
                            "Release check failed safely."));
        } finally {
            operationLock.unlock();
        }
    }

    private AutarkOsJobOutcome runInstall(
            AutarkOsJob job,
            ProModuleAuthorization authorization) {
        operationLock.lock();
        Progress progress = new Progress(job, installSteps());
        try {
            ProModuleSnapshot initial = safeLoad();
            ProModuleSnapshot snapshot = prepareOperation(
                    initial,
                    installOperation(initial),
                    job.jobId());
            ProModuleCandidate candidate;
            if (snapshot.candidateEnvelope() == null) {
                progress.begin(
                        "check_release",
                        "Checking assigned release.");
                candidate = checkAssignedRelease(authorization);
                progress.succeed(
                        "check_release",
                        "Release assignment checked.");
                progress.begin(
                        "verify_manifest",
                        "Verifying signed release.");
                if (candidate == null) {
                    progress.succeed(
                            "verify_manifest",
                            "No release is currently assigned.");
                    progress.skipPending(
                            "No installation step was required.");
                    completeOperation(snapshot, job.jobId());
                    return AutarkOsJobOutcome.succeeded(
                            "No Autark Pro release is currently assigned.",
                            progress.steps());
                }
                snapshot = acceptCandidate(
                        snapshot,
                        candidate,
                        job.jobId());
                if (snapshot.candidateDigest() == null) {
                    progress.succeed(
                            "verify_manifest",
                            "The active release is already current.");
                    progress.skipPending(
                            "The active release required no change.");
                    completeOperation(snapshot, job.jobId());
                    return AutarkOsJobOutcome.succeeded(
                            "Autark Pro is already current.",
                            progress.steps());
                }
                progress.succeed(
                        "verify_manifest",
                        "Signed release verified.");
            } else {
                progress.skip(
                        "check_release",
                        "Using the already verified release.");
                progress.begin(
                        "verify_manifest",
                        "Rechecking persisted release authority.");
                candidate = verifyPersistedCandidate(
                        snapshot,
                        authorization);
                progress.succeed(
                        "verify_manifest",
                        "Persisted release authority verified.");
            }

            snapshot = transition(
                    snapshot,
                    ProModuleState.DOWNLOADING,
                    snapshot.operation(),
                    job.jobId(),
                    "not-checked",
                    null);
            progress.begin("download", "Downloading by immutable digest.");
            try {
                runtime.download(candidate);
            } catch (RuntimeException exception) {
                audit(
                        snapshot,
                        ProModuleState.DOWNLOADING,
                        ProAuditEventType.PULL_FAILED,
                        "failed",
                        safeAuditReason(errorCode(exception)));
                throw exception;
            }
            snapshot = transition(
                    snapshot,
                    ProModuleState.VERIFYING,
                    snapshot.operation(),
                    job.jobId(),
                    "not-checked",
                    null);
            progress.succeed("download", "Digest-addressed image downloaded.");

            progress.begin("verify_image", "Verifying local image digest.");
            runtime.verifyImage(candidate);
            snapshot = transition(
                    snapshot,
                    ProModuleState.STARTING_CANDIDATE,
                    snapshot.operation(),
                    job.jobId(),
                    "not-checked",
                    null);
            progress.succeed("verify_image", "Local image digest verified.");

            progress.begin(
                    "start_candidate",
                    "Starting isolated candidate.");
            runtime.startCandidate(candidate);
            snapshot = transition(
                    snapshot,
                    ProModuleState.HEALTH_CHECKING,
                    snapshot.operation(),
                    job.jobId(),
                    "not-checked",
                    null);
            progress.succeed(
                    "start_candidate",
                    "Candidate started without cutover.");

            progress.begin("health_check", "Checking candidate health.");
            ProModuleRuntime.HealthResult health =
                    runtime.healthCheck(candidate);
            if (health == null || !health.healthy()) {
                String healthFailure = health == null
                        ? "health_unavailable"
                        : safeReason(health.reasonCode());
                audit(
                        snapshot,
                        ProModuleState.HEALTH_CHECKING,
                        ProAuditEventType.HEALTH_RESULT,
                        "failed",
                        healthFailure);
                progress.fail(
                        "health_check",
                        "Candidate did not pass health checks.");
                return rollbackCandidate(
                        snapshot,
                        progress,
                        "candidate_unhealthy",
                        healthFailure);
            }
            snapshot = transition(
                    snapshot,
                    ProModuleState.HEALTH_CHECKING,
                    snapshot.operation(),
                    job.jobId(),
                    "healthy",
                    safeReason(health.reasonCode()));
            progress.succeed(
                    "health_check",
                    "Candidate health checks passed.");
            progress.skip(
                    "rollback",
                    "Rollback was not required.");

            progress.begin("activate", "Activating verified candidate.");
            audit(
                    snapshot,
                    ProModuleState.ACTIVE,
                    ProAuditEventType.CUTOVER,
                    "started",
                    "healthy");
            runtime.activateCandidate(candidate);
            ProModuleSnapshot active = repository.save(
                    snapshot.activateCandidate(
                            job.jobId(),
                            safeReason(health.reasonCode()),
                            clock.instant()));
            audit(
                    active,
                    ProModuleState.ACTIVE,
                    ProAuditEventType.CUTOVER,
                    "completed",
                    safeAuditReason(health.reasonCode()));
            manifestVerifier.markKnownGood(
                    new ReleaseManifestVerifier.VerifiedRelease(
                            candidate.manifest(),
                            candidate.fingerprint(),
                            ReleaseStateRepository.AcceptanceResult.IDEMPOTENT),
                    clock.instant());
            progress.succeed("activate", "Verified candidate activated.");
            progress.begin(
                    "retain_rollback",
                    "Retaining previous known-good image.");
            progress.succeed(
                    "retain_rollback",
                    active.previousDigest() == null
                            ? "No previous image requires retention."
                            : "Previous known-good image retained.");
            return AutarkOsJobOutcome.succeeded(
                    "Autark Pro is active.",
                    progress.steps());
        } catch (RuntimeException exception) {
            ProModuleSnapshot current = safeLoad();
            if (List.of(
                            ProModuleState.STARTING_CANDIDATE,
                            ProModuleState.HEALTH_CHECKING,
                            ProModuleState.ROLLING_BACK)
                    .contains(current.state())) {
                try {
                    return rollbackCandidate(
                            current,
                            progress,
                            errorCode(exception),
                            "candidate_operation_failed");
                } catch (RuntimeException rollbackFailure) {
                    persistFailure(
                            safeLoad(),
                            "rollback_failed",
                            "Autark Pro rollback needs attention.");
                }
            } else {
                persistFailure(
                        current,
                        errorCode(exception),
                        "Autark Pro could not finish the module operation.");
            }
            return AutarkOsJobOutcome.failed(
                    "Autark Pro could not finish the module operation.",
                    progress.failCurrent(
                            "The module operation stopped safely."));
        } finally {
            operationLock.unlock();
        }
    }

    private AutarkOsJobOutcome runRemove(AutarkOsJob job) {
        operationLock.lock();
        Progress progress = new Progress(job, removeSteps());
        try {
            ProModuleSnapshot snapshot = safeLoad();
            if (snapshot.state() == ProModuleState.NOT_INSTALLED) {
                progress.skip(
                        "remove_module",
                        "Autark Pro is already removed.");
                return AutarkOsJobOutcome.succeeded(
                        "Autark Pro is already removed.",
                        progress.steps());
            }
            snapshot = transition(
                    snapshot,
                    ProModuleState.REMOVING,
                    "remove",
                    job.jobId(),
                    snapshot.health(),
                    snapshot.lastHealthResult());
            progress.begin("remove_module", "Removing Pro module runtime.");
            runtime.remove(
                    snapshot.activeDigest(),
                    snapshot.previousDigest());
            audit(
                    snapshot,
                    ProModuleState.NOT_INSTALLED,
                    ProAuditEventType.REMOVAL,
                    "completed",
                    "removed");
            repository.save(removed(snapshot, job.jobId()));
            progress.succeed(
                    "remove_module",
                    "Autark Pro module runtime removed.");
            return AutarkOsJobOutcome.succeeded(
                    "Autark Pro module data was removed.",
                    progress.steps());
        } catch (RuntimeException exception) {
            persistFailure(
                    safeLoad(),
                    errorCode(exception),
                    "Autark Pro removal needs attention.");
            return AutarkOsJobOutcome.failed(
                    "Autark Pro removal needs attention.",
                    progress.failCurrent("Removal stopped safely."));
        } finally {
            operationLock.unlock();
        }
    }

    private ProModuleCandidate checkAssignedRelease(
            ProModuleAuthorization authorization) {
        DeviceIdentity identity = identityService.current();
        UUID challengeRequestId = UUID.randomUUID();
        var challenge = controlPlaneClient.createDeviceChallenge(
                ProControlPlaneClient.ChallengePurpose.RELEASE_CHECK,
                identity.deviceId(),
                challengeRequestId);
        var proof = proofFactory.create(
                ProControlPlaneClient.ChallengePurpose.RELEASE_CHECK,
                challenge);
        var result = controlPlaneClient.checkRelease(
                proof,
                UUID.randomUUID());
        if (result.release() == null) {
            return null;
        }
        Instant trustedNow = requireTrustedServerTime(
                result.serverTime(),
                authorization.entitlement().lastVerifiedServerTime());
        ReleaseManifestVerifier.VerifiedRelease verified =
                manifestVerifier.verifyForDownload(
                        result.release(),
                        verificationContext(
                                authorization,
                                trustedNow,
                                null));
        return new ProModuleCandidate(
                verified.manifest(),
                verified.fingerprint(),
                result.release());
    }

    private ProModuleCandidate verifyPersistedCandidate(
            ProModuleSnapshot snapshot,
            ProModuleAuthorization authorization) {
        Instant trustedNow =
                authorization.entitlement().lastVerifiedServerTime();
        if (trustedNow == null) {
            throw new ProModuleException(
                    "trusted_time_unavailable",
                    "Verified server time is required for a Pro update.");
        }
        ReleaseManifestVerifier.VerifiedRelease verified =
                manifestVerifier.verifyForDownload(
                        snapshot.candidateEnvelope(),
                        verificationContext(
                                authorization,
                                trustedNow,
                                snapshot.candidateDigest()));
        if (verified.manifest().sequence()
                        != snapshot.candidateManifestSequence()
                || !verified.fingerprint().equals(
                        snapshot.candidateManifestFingerprint())) {
            throw new ProModuleException(
                    "persisted_candidate_invalid",
                    "Persisted Pro release authority is invalid.");
        }
        return new ProModuleCandidate(
                verified.manifest(),
                verified.fingerprint(),
                snapshot.candidateEnvelope());
    }

    private ReleaseManifestVerifier.VerificationContext verificationContext(
            ProModuleAuthorization authorization,
            Instant trustedNow,
            String expectedDigest) {
        return new ReleaseManifestVerifier.VerificationContext(
                architecture,
                coreVersion,
                agentApiMajor,
                authorization.releaseChannel(),
                expectedDigest,
                authorization.entitlement(),
                trustedNow);
    }

    private ProModuleSnapshot acceptCandidate(
            ProModuleSnapshot snapshot,
            ProModuleCandidate candidate,
            String jobId) {
        if (candidate.manifest().digest().equals(snapshot.activeDigest())) {
            if (snapshot.candidateDigest() == null) {
                return transition(
                        snapshot,
                        ProModuleState.ACTIVE,
                        null,
                        jobId,
                        snapshot.health(),
                        snapshot.lastHealthResult());
            }
            return repository.save(snapshot.clearCandidate(
                    ProModuleState.ACTIVE,
                    null,
                    jobId,
                    snapshot.health(),
                    snapshot.lastHealthResult(),
                    clock.instant()));
        }
        transitions.requireAllowed(
                snapshot.state(),
                ProModuleState.RELEASE_AVAILABLE);
        return repository.save(
                snapshot.withCandidate(
                        candidate,
                        snapshot.activeDigest() == null
                                ? "install"
                                : "update",
                        jobId,
                        clock.instant()));
    }

    private AutarkOsJobOutcome rollbackCandidate(
            ProModuleSnapshot snapshot,
            Progress progress,
            String failureCode,
            String healthResult) {
        snapshot = transition(
                snapshot,
                ProModuleState.ROLLING_BACK,
                "rollback",
                snapshot.jobId(),
                "failed",
                healthResult);
        progress.begin("rollback", "Restoring known-good runtime.");
        runtime.rollback(
                snapshot.activeDigest(),
                snapshot.previousDigest(),
                snapshot.candidateDigest());
        audit(
                snapshot,
                ProModuleState.ROLLING_BACK,
                ProAuditEventType.ROLLBACK,
                "completed",
                safeAuditReason(healthResult));
        ProModuleSnapshot restored = restoredAfterRollback(
                snapshot,
                snapshot.jobId(),
                healthResult);
        repository.save(restored);
        progress.succeed("rollback", "Known-good runtime restored.");
        return AutarkOsJobOutcome.failed(
                "The candidate was rejected and the known-good runtime was restored.",
                progress.failCurrent(
                        "Candidate rejected: " + safeReason(failureCode) + "."));
    }

    private ProModuleSnapshot prepareOperation(
            ProModuleSnapshot snapshot,
            String operation,
            String jobId) {
        if (IN_PROGRESS.contains(snapshot.state())) {
            throw new ProModuleException(
                    "module_operation_in_progress",
                    "Another Autark Pro module operation is already running.");
        }
        if (snapshot.state() == ProModuleState.ERROR
                && snapshot.candidateDigest() != null) {
            transitions.requireAllowed(
                    snapshot.state(),
                    ProModuleState.RELEASE_AVAILABLE);
            snapshot = repository.save(snapshot.withState(
                    ProModuleState.RELEASE_AVAILABLE,
                    operation,
                    jobId,
                    snapshot.activeDigest() == null
                            ? "not-checked"
                            : snapshot.health(),
                    snapshot.lastHealthResult(),
                    null,
                    null,
                    clock.instant()));
        }
        return repository.save(snapshot.withState(
                snapshot.state(),
                operation,
                jobId,
                snapshot.health(),
                snapshot.lastHealthResult(),
                null,
                null,
                clock.instant()));
    }

    private ProModuleSnapshot completeOperation(
            ProModuleSnapshot snapshot,
            String jobId) {
        return repository.save(snapshot.withState(
                snapshot.state(),
                null,
                jobId,
                snapshot.health(),
                snapshot.lastHealthResult(),
                null,
                null,
                clock.instant()));
    }

    private ProModuleSnapshot clearUnassignedCandidate(
            ProModuleSnapshot snapshot,
            String jobId) {
        if (snapshot.candidateDigest() == null) {
            return completeOperation(snapshot, jobId);
        }
        ProModuleState next = snapshot.activeDigest() == null
                ? ProModuleState.NOT_INSTALLED
                : ProModuleState.ACTIVE;
        transitions.requireAllowed(snapshot.state(), next);
        return repository.save(snapshot.clearCandidate(
                next,
                null,
                jobId,
                snapshot.activeDigest() == null
                        ? "not-checked"
                        : snapshot.health(),
                "assignment_withdrawn",
                clock.instant()));
    }

    private ProModuleSnapshot reconcileEntitlement(
            ProModuleSnapshot snapshot,
            ProEntitlementStatus entitlement) {
        if (entitlement == null || IN_PROGRESS.contains(snapshot.state())) {
            return snapshot;
        }
        boolean hasActive = snapshot.activeDigest() != null;
        if (entitlement.state() == ProEntitlementState.RETAINED_USE
                && entitlement.localUseAllowed()
                && hasActive
                && snapshot.state() != ProModuleState.RETAINED_USE) {
            if (snapshot.candidateDigest() != null) {
                transitions.requireAllowed(
                        snapshot.state(),
                        ProModuleState.RETAINED_USE);
                audit(
                        snapshot,
                        ProModuleState.RETAINED_USE,
                        ProAuditEventType.RETAINED_USE,
                        "completed",
                        "retained_use_update_suppressed");
                return repository.save(snapshot.clearCandidate(
                        ProModuleState.RETAINED_USE,
                        null,
                        snapshot.jobId(),
                        snapshot.health(),
                        snapshot.lastHealthResult(),
                        clock.instant()));
            }
            return transition(
                    snapshot,
                    ProModuleState.RETAINED_USE,
                    null,
                    snapshot.jobId(),
                    snapshot.health(),
                    snapshot.lastHealthResult());
        }
        if (!entitlement.localUseAllowed()
                && snapshot.state() != ProModuleState.UPDATE_INELIGIBLE
                && snapshot.state() != ProModuleState.NOT_INSTALLED) {
            if (snapshot.candidateDigest() != null) {
                transitions.requireAllowed(
                        snapshot.state(),
                        ProModuleState.UPDATE_INELIGIBLE);
                audit(
                        snapshot,
                        ProModuleState.UPDATE_INELIGIBLE,
                        ProAuditEventType.MODULE_STATE_TRANSITION,
                        "needs_attention",
                        "module_update_unauthorized");
                return repository.save(snapshot.clearCandidate(
                        ProModuleState.UPDATE_INELIGIBLE,
                        null,
                        snapshot.jobId(),
                        snapshot.health(),
                        snapshot.lastHealthResult(),
                        clock.instant()));
            }
            return transition(
                    snapshot,
                    ProModuleState.UPDATE_INELIGIBLE,
                    null,
                    snapshot.jobId(),
                    snapshot.health(),
                    snapshot.lastHealthResult());
        }
        if (entitlement.updatesAllowed()
                && snapshot.state() == ProModuleState.RETAINED_USE) {
            return transition(
                    snapshot,
                    "degraded".equals(snapshot.health())
                            ? ProModuleState.DEGRADED
                            : ProModuleState.ACTIVE,
                    null,
                    snapshot.jobId(),
                    snapshot.health(),
                    snapshot.lastHealthResult());
        }
        if (entitlement.updatesAllowed()
                && snapshot.state() == ProModuleState.UPDATE_INELIGIBLE
                && hasActive) {
            return transition(
                    snapshot,
                    ProModuleState.ACTIVE,
                    null,
                    snapshot.jobId(),
                    snapshot.health(),
                    snapshot.lastHealthResult());
        }
        if (entitlement.updatesAllowed()
                && snapshot.state() == ProModuleState.UPDATE_INELIGIBLE) {
            return transition(
                    snapshot,
                    ProModuleState.NOT_INSTALLED,
                    null,
                    snapshot.jobId(),
                    "not-checked",
                    snapshot.lastHealthResult());
        }
        return snapshot;
    }

    private ProModuleSnapshot unwindDownload(
            ProModuleSnapshot snapshot) {
        if (snapshot.candidateDigest() != null) {
            runtime.discardCandidate(snapshot.candidateDigest());
        }
        return transition(
                snapshot,
                ProModuleState.RELEASE_AVAILABLE,
                null,
                null,
                snapshot.activeDigest() == null
                        ? "not-checked"
                        : snapshot.health(),
                "interrupted_download_discarded");
    }

    private ProModuleSnapshot recoverCandidate(
            ProModuleSnapshot snapshot) {
        ProModuleSnapshot rolling = transition(
                snapshot,
                ProModuleState.ROLLING_BACK,
                "recovery",
                null,
                "failed",
                "interrupted_candidate");
        return finishRollback(rolling);
    }

    private ProModuleSnapshot finishRollback(
            ProModuleSnapshot snapshot) {
        audit(
                snapshot,
                ProModuleState.ROLLING_BACK,
                ProAuditEventType.ROLLBACK,
                "started",
                "restart_recovery");
        if (snapshot.candidateDigest() == null
                && snapshot.previousDigest() != null) {
            runtime.rollback(
                    snapshot.previousDigest(),
                    null,
                    snapshot.activeDigest());
            ProModuleSnapshot restored =
                    snapshot.restorePrevious(
                            null,
                            "restart_recovery",
                            clock.instant());
            audit(
                    restored,
                    ProModuleState.ACTIVE,
                    ProAuditEventType.ROLLBACK,
                    "completed",
                    "restart_recovery");
            resetActiveFailures(restored.activeDigest());
            return repository.save(restored);
        }
        runtime.rollback(
                snapshot.activeDigest(),
                snapshot.previousDigest(),
                snapshot.candidateDigest());
        ProModuleSnapshot restored = restoredAfterRollback(
                snapshot,
                null,
                "restart_recovery");
        audit(
                restored,
                restored.state(),
                ProAuditEventType.ROLLBACK,
                "completed",
                "restart_recovery");
        return repository.save(restored);
    }

    private ProModuleSnapshot rollbackActiveRuntime(
            ProModuleSnapshot snapshot,
            String reason) {
        ProModuleSnapshot rolling = transition(
                snapshot,
                ProModuleState.ROLLING_BACK,
                "rollback",
                snapshot.jobId(),
                "failed",
                reason);
        runtime.rollback(
                rolling.previousDigest(),
                null,
                rolling.activeDigest());
        ProModuleSnapshot restored = rolling.restorePrevious(
                rolling.jobId(),
                "crash_loop_rollback",
                clock.instant());
        audit(
                restored,
                ProModuleState.ACTIVE,
                ProAuditEventType.ROLLBACK,
                "completed",
                "crash_loop_rollback");
        resetActiveFailures(restored.activeDigest());
        return repository.save(restored);
    }

    private ProModuleSnapshot finishRemoval(
            ProModuleSnapshot snapshot) {
        audit(
                snapshot,
                ProModuleState.REMOVING,
                ProAuditEventType.REMOVAL,
                "started",
                "restart_recovery");
        runtime.remove(
                snapshot.activeDigest(),
                snapshot.previousDigest());
        audit(
                snapshot,
                ProModuleState.NOT_INSTALLED,
                ProAuditEventType.REMOVAL,
                "completed",
                "restart_recovery");
        return repository.save(removed(snapshot, null));
    }

    private ProModuleSnapshot restoredAfterRollback(
            ProModuleSnapshot snapshot,
            String jobId,
            String healthResult) {
        ProModuleState next = snapshot.activeDigest() == null
                ? ProModuleState.NOT_INSTALLED
                : ProModuleState.ACTIVE;
        transitions.requireAllowed(snapshot.state(), next);
        return snapshot.clearCandidate(
                next,
                null,
                jobId,
                snapshot.activeDigest() == null
                        ? "not-checked"
                        : snapshot.health().equals("failed")
                                ? "healthy"
                                : snapshot.health(),
                healthResult,
                clock.instant());
    }

    private ProModuleSnapshot removed(
            ProModuleSnapshot snapshot,
            String jobId) {
        transitions.requireAllowed(
                snapshot.state(),
                ProModuleState.NOT_INSTALLED);
        Instant now = clock.instant();
        return new ProModuleSnapshot(
                ProModuleState.NOT_INSTALLED,
                null,
                jobId,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                snapshot.acceptedManifestSequence(),
                "not-checked",
                "removed",
                now,
                null,
                null,
                snapshot.revision(),
                now);
    }

    private ProModuleSnapshot transition(
            ProModuleSnapshot snapshot,
            ProModuleState next,
            String operation,
            String jobId,
            String health,
            String healthResult) {
        transitions.requireAllowed(snapshot.state(), next);
        audit(
                snapshot,
                next,
                transitionEventType(next),
                transitionOutcome(next, health),
                safeAuditReason(healthResult));
        return repository.save(snapshot.withState(
                next,
                operation,
                jobId,
                health,
                healthResult,
                null,
                null,
                clock.instant()));
    }

    private void audit(
            ProModuleSnapshot snapshot,
            ProModuleState next,
            ProAuditEventType type,
            String outcome,
            String reasonCode) {
        if (audit == null) {
            return;
        }
        boolean candidateAuthority =
                snapshot.candidateDigest() != null
                        && List.of(
                                        ProModuleState.RELEASE_AVAILABLE,
                                        ProModuleState.DOWNLOADING,
                                        ProModuleState.VERIFYING,
                                        ProModuleState.STARTING_CANDIDATE,
                                        ProModuleState.HEALTH_CHECKING,
                                        ProModuleState.ROLLING_BACK,
                                        ProModuleState.ACTIVE)
                                .contains(next);
        String digest = candidateAuthority
                ? snapshot.candidateDigest()
                : snapshot.activeDigest();
        String version = candidateAuthority
                ? snapshot.candidateVersion()
                : snapshot.componentVersion();
        String fingerprint = candidateAuthority
                ? snapshot.candidateManifestFingerprint()
                : snapshot.activeManifestFingerprint();
        audit.recordRequired(new ProAuditEvent(
                "module-"
                        + snapshot.revision()
                        + "-"
                        + type.wireValue()
                        + "-"
                        + next.name().toLowerCase(
                                java.util.Locale.ROOT),
                type,
                snapshot.jobId(),
                "autark-pro-agent",
                version,
                digest,
                snapshot.state().name(),
                next.name(),
                outcome,
                reasonCode,
                null,
                fingerprint));
    }

    private static ProAuditEventType transitionEventType(
            ProModuleState next) {
        if (next == ProModuleState.DOWNLOADING) {
            return ProAuditEventType.PULL_STARTED;
        }
        if (next == ProModuleState.VERIFYING) {
            return ProAuditEventType.PULL_COMPLETED;
        }
        if (next == ProModuleState.STARTING_CANDIDATE) {
            return ProAuditEventType.CANDIDATE_START;
        }
        if (next == ProModuleState.HEALTH_CHECKING) {
            return ProAuditEventType.HEALTH_RESULT;
        }
        if (next == ProModuleState.ROLLING_BACK) {
            return ProAuditEventType.ROLLBACK;
        }
        if (next == ProModuleState.REMOVING) {
            return ProAuditEventType.REMOVAL;
        }
        if (next == ProModuleState.RETAINED_USE) {
            return ProAuditEventType.RETAINED_USE;
        }
        return ProAuditEventType.MODULE_STATE_TRANSITION;
    }

    private static String transitionOutcome(
            ProModuleState next,
            String health) {
        if (next == ProModuleState.ROLLING_BACK
                || next == ProModuleState.ERROR) {
            return "needs_attention";
        }
        if (List.of(
                        ProModuleState.DOWNLOADING,
                        ProModuleState.STARTING_CANDIDATE,
                        ProModuleState.HEALTH_CHECKING,
                        ProModuleState.REMOVING)
                .contains(next)
                && !"healthy".equals(health)) {
            return "started";
        }
        return "completed";
    }

    private static String safeAuditReason(String value) {
        return value != null
                        && value.matches(
                                "^[a-z][a-z0-9_]{0,63}$")
                ? value
                : null;
    }

    private ProModuleSnapshot persistFailure(
            ProModuleSnapshot snapshot,
            String code,
            String message) {
        String safeCode = ERROR_CODE.matcher(
                        code == null ? "" : code)
                .matches()
                ? code
                : "module_operation_failed";
        try {
            transitions.requireAllowed(
                    snapshot.state(),
                    ProModuleState.ERROR);
            return repository.save(snapshot.withState(
                    ProModuleState.ERROR,
                    null,
                    snapshot.jobId(),
                    "failed",
                    snapshot.lastHealthResult(),
                    safeCode,
                    message,
                    clock.instant()));
        } catch (RuntimeException exception) {
            fallbackState = snapshot.withState(
                    ProModuleState.ERROR,
                    null,
                    snapshot.jobId(),
                    "failed",
                    snapshot.lastHealthResult(),
                    safeCode,
                    message,
                    clock.instant());
            return fallbackState;
        }
    }

    private ProModuleSnapshot persistDegraded(
            ProModuleSnapshot snapshot,
            String healthResult) {
        try {
            ProModuleState next =
                    snapshot.state()
                                    == ProModuleState.RETAINED_USE
                            ? ProModuleState.RETAINED_USE
                            : ProModuleState.DEGRADED;
            transitions.requireAllowed(
                    snapshot.state(),
                    next);
            audit(
                    snapshot,
                    next,
                    ProAuditEventType.HEALTH_RESULT,
                    "failed",
                    safeAuditReason(healthResult));
            return repository.save(snapshot.withState(
                    next,
                    null,
                    snapshot.jobId(),
                    "degraded",
                    safeReason(healthResult),
                    null,
                    null,
                    clock.instant()));
        } catch (RuntimeException exception) {
            return persistFailure(
                    snapshot,
                    "module_runtime_degraded",
                    "Autark Pro runtime needs attention.");
        }
    }

    private void resetActiveFailures(String digest) {
        monitoredDigest = digest;
        consecutiveActiveFailures = 0;
    }

    private ProModuleSnapshot discardExpiredPrevious(
            ProModuleSnapshot snapshot) {
        if (snapshot.previousDigest() == null
                || snapshot.lastSuccessfulTransitionAt() == null
                || clock.instant().isBefore(
                        snapshot.lastSuccessfulTransitionAt()
                                .plus(rollbackRetention))) {
            return snapshot;
        }
        runtime.discardPrevious(
                snapshot.activeDigest(),
                snapshot.previousDigest());
        return repository.save(
                snapshot.clearPrevious(clock.instant()));
    }

    private ProModuleSnapshot safeLoad() {
        try {
            ProModuleSnapshot loaded = repository.load();
            fallbackState = loaded;
            return loaded;
        } catch (RuntimeException exception) {
            try {
                fallbackState = repository.replaceCorruptState(
                        "module_state_corrupt",
                        "Pro module state needs recovery.");
            } catch (RuntimeException ignored) {
                fallbackState = fallbackState.withState(
                        ProModuleState.ERROR,
                        null,
                        null,
                        "failed",
                        null,
                        "module_state_corrupt",
                        "Pro module state needs recovery.",
                        clock.instant());
            }
            return fallbackState;
        }
    }

    private void requireUpdates(ProModuleAuthorization authorization) {
        if (authorization == null
                || authorization.entitlement() == null
                || authorization.releaseChannel() == null
                || !List.of("development", "staging", "beta", "stable")
                        .contains(authorization.releaseChannel())) {
            throw new ProModuleException(
                    "module_update_unauthorized",
                    "Autark Pro updates are not authorized.");
        }
        ProEntitlementStatus entitlement = authorization.entitlement();
        if (!entitlement.updatesAllowed()
                || entitlement.state() != ProEntitlementState.ACTIVE) {
            status(entitlement);
            throw new ProModuleException(
                    entitlement.state() == ProEntitlementState.RETAINED_USE
                            ? "retained_use_update_suppressed"
                            : "module_update_unauthorized",
                    "Autark Pro updates are not authorized.");
        }
    }

    private static Instant requireTrustedServerTime(
            Instant candidate,
            Instant previous) {
        if (candidate == null
                || (previous != null && candidate.isBefore(previous))) {
            throw new ProModuleException(
                    "stale_server_time",
                    "Control-plane time did not advance monotonically.");
        }
        return candidate;
    }

    private static String installOperation(ProModuleSnapshot snapshot) {
        return snapshot.activeDigest() == null ? "install" : "update";
    }

    private static String errorCode(RuntimeException exception) {
        if (exception instanceof ProModuleException module) {
            return module.code();
        }
        if (exception instanceof ProControlPlaneException controlPlane) {
            return controlPlane.code();
        }
        return "module_operation_failed";
    }

    private static String safeReason(String value) {
        return value != null
                        && ERROR_CODE.matcher(value).matches()
                ? value
                : "result_unavailable";
    }

    private static String resolveArchitecture(String configured) {
        String value = configured == null || configured.isBlank()
                ? System.getProperty("os.arch", "")
                : configured;
        return switch (value.toLowerCase(java.util.Locale.ROOT)) {
            case "x86_64", "amd64", "linux/amd64" -> "linux/amd64";
            case "aarch64", "arm64", "linux/arm64" -> "linux/arm64";
            default -> throw new IllegalStateException(
                    "Autark Pro requires linux/amd64 or linux/arm64.");
        };
    }

    private static String requireArchitecture(String value) {
        if (!List.of("linux/amd64", "linux/arm64").contains(value)) {
            throw new IllegalArgumentException(
                    "Pro architecture is invalid.");
        }
        return value;
    }

    private static String requireCoreVersion(String value) {
        if (value == null || value.isBlank() || value.length() > 128) {
            throw new IllegalArgumentException(
                    "Core version is invalid.");
        }
        return value;
    }

    private static Duration requireRollbackRetention(Duration value) {
        if (value == null
                || value.compareTo(Duration.ofMinutes(1)) < 0
                || value.compareTo(Duration.ofDays(90)) > 0) {
            throw new IllegalArgumentException(
                    "Pro rollback retention must be between one minute and 90 days.");
        }
        return value;
    }

    private static ProStatusResponse.ModuleStatus toStatus(
            ProModuleSnapshot snapshot) {
        return new ProStatusResponse.ModuleStatus(
                snapshot.state(),
                snapshot.componentVersion() == null
                        ? snapshot.candidateVersion()
                        : snapshot.componentVersion(),
                snapshot.activeDigest(),
                snapshot.previousDigest(),
                snapshot.health(),
                snapshot.jobId(),
                snapshot.lastErrorCode());
    }

    private static List<AutarkOsJobStep> checkSteps() {
        return steps(
                new Step("check_release", "Check assigned release"),
                new Step("verify_manifest", "Verify signed release"));
    }

    private static List<AutarkOsJobStep> installSteps() {
        return steps(
                new Step("check_release", "Check assigned release"),
                new Step("verify_manifest", "Verify signed release"),
                new Step("download", "Download exact image digest"),
                new Step("verify_image", "Verify local image digest"),
                new Step("start_candidate", "Start isolated candidate"),
                new Step("health_check", "Check candidate health"),
                new Step("activate", "Activate verified candidate"),
                new Step("rollback", "Restore known-good runtime"),
                new Step("retain_rollback", "Retain rollback image"));
    }

    private static List<AutarkOsJobStep> removeSteps() {
        return steps(new Step("remove_module", "Remove Pro module"));
    }

    private static List<AutarkOsJobStep> steps(Step... definitions) {
        return Arrays.stream(definitions)
                .map(step -> AutarkOsJobStep.pending(
                        step.id(),
                        step.label()))
                .toList();
    }

    public record ProModuleAuthorization(
            ProEntitlementStatus entitlement,
            String releaseChannel) {
    }

    private record Step(String id, String label) {
    }

    private final class Progress {

        private final String jobId;
        private List<AutarkOsJobStep> steps;
        private String current;

        private Progress(
                AutarkOsJob job,
                List<AutarkOsJobStep> initial) {
            this.jobId = job.jobId();
            this.steps = new ArrayList<>(initial);
        }

        private void begin(String id, String message) {
            current = id;
            update(id, "running", message, true, false);
        }

        private void succeed(String id, String message) {
            update(id, "succeeded", message, false, true);
            if (id.equals(current)) {
                current = null;
            }
        }

        private void fail(String id, String message) {
            update(id, "failed", message, false, true);
            current = id;
        }

        private void skip(String id, String message) {
            update(id, "succeeded", message, false, true);
        }

        private void skipPending(String message) {
            List<String> pending = steps.stream()
                    .filter(step -> "pending".equals(step.status()))
                    .map(AutarkOsJobStep::id)
                    .toList();
            pending.forEach(id -> skip(id, message));
        }

        private List<AutarkOsJobStep> failCurrent(String message) {
            if (current != null) {
                fail(current, message);
            }
            return steps();
        }

        private List<AutarkOsJobStep> steps() {
            return List.copyOf(steps);
        }

        private void update(
                String id,
                String status,
                String message,
                boolean started,
                boolean finished) {
            Instant now = clock.instant();
            steps = steps.stream()
                    .map(step -> step.id().equals(id)
                            ? new AutarkOsJobStep(
                                    step.id(),
                                    step.label(),
                                    status,
                                    message,
                                    started ? now : step.startedAt(),
                                    finished ? now : step.finishedAt())
                            : step)
                    .toList();
            jobService.recordProgress(jobId, steps);
        }
    }
}
