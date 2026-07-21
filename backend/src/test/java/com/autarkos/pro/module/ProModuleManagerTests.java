package com.autarkos.pro.module;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import java.nio.file.Path;
import java.security.PublicKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobRepository;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditEventType;
import com.autarkos.pro.audit.ProAuditException;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.controlplane.DeviceOperationProofFactory;
import com.autarkos.pro.controlplane.ProControlPlaneClient;
import com.autarkos.pro.identity.DeviceChallengeSignature;
import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DeviceIdentityService;
import com.autarkos.pro.identity.DevicePublicKey;
import com.autarkos.pro.model.DeviceRegistrationRequest;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.model.ProModuleState;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.autarkos.pro.release.ReleaseManifestVerifier;
import com.autarkos.pro.release.ReleaseStateRepository;
import com.autarkos.pro.release.ReleaseTrustStore;
import com.autarkos.testsupport.JpaTestRepositories;

class ProModuleManagerTests {

    private static final Instant NOW =
            Instant.parse("2026-07-19T12:00:00Z");
    private static final Clock CLOCK =
            Clock.fixed(NOW, ZoneOffset.UTC);
    private static final String ACTIVE_DIGEST =
            "sha256:" + "a".repeat(64);
    private static final ProModuleCandidate CANDIDATE =
            SqliteProModuleRepositoryTests.candidate();

    @TempDir
    Path runtimeRoot;

    @Test
    void verifiedInstallPersistsEveryBoundaryAndUsesSharedProgress() {
        InMemoryRepository repository =
                new InMemoryRepository(
                        ProModuleSnapshot.notInstalled(NOW));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        Fixture fixture = fixture(repository, runtime, false);

        AutarkOsJob first =
                fixture.manager.installOrUpdate(authorization());
        AutarkOsJob concurrent =
                fixture.manager.installOrUpdate(authorization());
        assertThat(concurrent.jobId()).isEqualTo(first.jobId());

        fixture.jobs.runQueuedJobsNow();

        ProModuleSnapshot active = repository.load();
        AutarkOsJob completed =
                fixture.jobs.findById(first.jobId()).orElseThrow();
        assertThat(active.state()).isEqualTo(ProModuleState.ACTIVE);
        assertThat(active.activeDigest())
                .isEqualTo(CANDIDATE.manifest().digest());
        assertThat(active.previousDigest()).isNull();
        assertThat(active.candidateDigest()).isNull();
        assertThat(active.acceptedManifestSequence()).isEqualTo(7);
        assertThat(active.health()).isEqualTo("healthy");
        assertThat(runtime.calls).containsExactly(
                "download",
                "verify",
                "start",
                "health",
                "activate");
        assertThat(fixture.verifier.knownGoodCalls).isEqualTo(1);
        assertThat(completed.status()).isEqualTo("succeeded");
        assertThat(completed.steps())
                .extracting(com.autarkos.jobs.AutarkOsJobStep::status)
                .containsOnly("succeeded");
        assertThat(repository.history)
                .extracting(ProModuleSnapshot::state)
                .containsSubsequence(
                        ProModuleState.RELEASE_AVAILABLE,
                        ProModuleState.DOWNLOADING,
                        ProModuleState.VERIFYING,
                        ProModuleState.STARTING_CANDIDATE,
                        ProModuleState.HEALTH_CHECKING,
                        ProModuleState.ACTIVE);

        int runtimeCalls = runtime.calls.size();
        AutarkOsJob repeat =
                fixture.manager.installOrUpdate(authorization());
        fixture.jobs.runQueuedJobsNow();
        assertThat(fixture.jobs.findById(repeat.jobId()).orElseThrow()
                .status()).isEqualTo("succeeded");
        assertThat(runtime.calls).hasSize(runtimeCalls);
        assertThat(repository.load().activeDigest())
                .isEqualTo(CANDIDATE.manifest().digest());
    }

    @Test
    void installAuditsEveryRuntimeBoundaryWithCompletedCutover() {
        InMemoryRepository repository =
                new InMemoryRepository(
                        ProModuleSnapshot.notInstalled(NOW));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        ProAuditService audit = mock(ProAuditService.class);
        List<ProAuditEvent> events = new ArrayList<>();
        doAnswer(invocation -> {
            events.add(invocation.getArgument(0));
            return null;
        }).when(audit).recordRequired(any(ProAuditEvent.class));
        Fixture fixture = fixture(
                repository,
                runtime,
                false,
                true,
                Duration.ofDays(7),
                audit);

        AutarkOsJob job =
                fixture.manager.installOrUpdate(authorization());
        fixture.jobs.runQueuedJobsNow();

        assertThat(fixture.jobs.findById(job.jobId()).orElseThrow()
                .status()).isEqualTo("succeeded");
        assertThat(events)
                .extracting(ProAuditEvent::type)
                .containsSubsequence(
                        ProAuditEventType.PULL_STARTED,
                        ProAuditEventType.PULL_COMPLETED,
                        ProAuditEventType.CANDIDATE_START,
                        ProAuditEventType.HEALTH_RESULT,
                        ProAuditEventType.HEALTH_RESULT,
                        ProAuditEventType.CUTOVER,
                        ProAuditEventType.CUTOVER);
        assertThat(events.stream()
                        .filter(event ->
                                event.type()
                                        == ProAuditEventType.CUTOVER)
                        .map(ProAuditEvent::outcome)
                        .toList())
                .containsExactly("started", "completed");
        assertThat(events)
                .allSatisfy(event -> {
                    assertThat(event.correlationId())
                            .isEqualTo(job.jobId());
                    assertThat(event.digest())
                            .isEqualTo(
                                    CANDIDATE.manifest().digest());
                });
    }

    @Test
    void requiredAuditFailureStopsBeforeRuntimeDownload() {
        InMemoryRepository repository =
                new InMemoryRepository(
                        ProModuleSnapshot.notInstalled(NOW));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        ProAuditService audit = mock(ProAuditService.class);
        doThrow(new ProAuditException(
                        new IllegalStateException("audit unavailable")))
                .when(audit)
                .recordRequired(any(ProAuditEvent.class));
        Fixture fixture = fixture(
                repository,
                runtime,
                false,
                true,
                Duration.ofDays(7),
                audit);

        AutarkOsJob job =
                fixture.manager.installOrUpdate(authorization());
        fixture.jobs.runQueuedJobsNow();

        assertThat(fixture.jobs.findById(job.jobId()).orElseThrow()
                .status()).isEqualTo("failed");
        assertThat(runtime.calls).isEmpty();
        assertThat(repository.load().state())
                .isEqualTo(ProModuleState.ERROR);
    }

    @Test
    void unhealthyCandidateAuditsFailedHealthAndRollbackCompletion() {
        InMemoryRepository repository =
                new InMemoryRepository(
                        ProModuleSnapshot.notInstalled(NOW));
        FakeRuntime runtime = new FakeRuntime(repository, false);
        ProAuditService audit = mock(ProAuditService.class);
        List<ProAuditEvent> events = new ArrayList<>();
        doAnswer(invocation -> {
            events.add(invocation.getArgument(0));
            return null;
        }).when(audit).recordRequired(any(ProAuditEvent.class));
        Fixture fixture = fixture(
                repository,
                runtime,
                false,
                true,
                Duration.ofDays(7),
                audit);

        AutarkOsJob job =
                fixture.manager.installOrUpdate(authorization());
        fixture.jobs.runQueuedJobsNow();

        assertThat(fixture.jobs.findById(job.jobId()).orElseThrow()
                .status()).isEqualTo("failed");
        assertThat(events.stream()
                        .filter(event ->
                                event.type()
                                        == ProAuditEventType.HEALTH_RESULT)
                        .map(ProAuditEvent::outcome)
                        .toList())
                .contains("failed");
        assertThat(events.stream()
                        .filter(event ->
                                event.type()
                                        == ProAuditEventType.ROLLBACK)
                        .map(ProAuditEvent::outcome)
                        .toList())
                .containsExactly(
                        "needs_attention",
                        "completed");
    }

    @Test
    void failedDownloadRecordsPullFailureBeforeStopping() {
        InMemoryRepository repository =
                new InMemoryRepository(
                        ProModuleSnapshot.notInstalled(NOW));
        FakeRuntime runtime =
                new FakeRuntime(repository, true)
                        .failDownload();
        ProAuditService audit = mock(ProAuditService.class);
        List<ProAuditEvent> events = new ArrayList<>();
        doAnswer(invocation -> {
            events.add(invocation.getArgument(0));
            return null;
        }).when(audit).recordRequired(any(ProAuditEvent.class));
        Fixture fixture = fixture(
                repository,
                runtime,
                false,
                true,
                Duration.ofDays(7),
                audit);

        AutarkOsJob job =
                fixture.manager.installOrUpdate(authorization());
        fixture.jobs.runQueuedJobsNow();

        assertThat(fixture.jobs.findById(job.jobId()).orElseThrow()
                .status()).isEqualTo("failed");
        assertThat(runtime.calls).containsExactly("download");
        assertThat(events.stream()
                        .filter(event ->
                                List.of(
                                                ProAuditEventType.PULL_STARTED,
                                                ProAuditEventType.PULL_FAILED)
                                        .contains(event.type()))
                        .map(event ->
                                event.type()
                                        + ":"
                                        + event.outcome()
                                        + ":"
                                        + event.reasonCode())
                        .toList())
                .containsExactly(
                        "PULL_STARTED:started:null",
                        "PULL_FAILED:failed:registry_pull_failed");
    }

    @Test
    void unverifiedManifestNeverAdvancesToDownload() {
        InMemoryRepository repository =
                new InMemoryRepository(
                        ProModuleSnapshot.notInstalled(NOW));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        Fixture fixture = fixture(repository, runtime, true);

        AutarkOsJob job =
                fixture.manager.installOrUpdate(authorization());
        fixture.jobs.runQueuedJobsNow();

        assertThat(fixture.jobs.findById(job.jobId()).orElseThrow()
                .status()).isEqualTo("failed");
        assertThat(runtime.calls).isEmpty();
        assertThat(repository.load().state())
                .isEqualTo(ProModuleState.ERROR);
        assertThat(repository.load().lastErrorMessage())
                .doesNotContainIgnoringCase("signature")
                .doesNotContainIgnoringCase("token");
    }

    @Test
    void unhealthyFirstCandidateRollsBackWithoutBecomingActive() {
        InMemoryRepository repository =
                new InMemoryRepository(
                        ProModuleSnapshot.notInstalled(NOW));
        FakeRuntime runtime = new FakeRuntime(repository, false);
        Fixture fixture = fixture(repository, runtime, false);

        AutarkOsJob job =
                fixture.manager.installOrUpdate(authorization());
        fixture.jobs.runQueuedJobsNow();

        assertThat(fixture.jobs.findById(job.jobId()).orElseThrow()
                .status()).isEqualTo("failed");
        assertThat(runtime.calls).containsSubsequence(
                "start",
                "health",
                "rollback");
        assertThat(repository.load().state())
                .isEqualTo(ProModuleState.NOT_INSTALLED);
        assertThat(repository.load().activeDigest()).isNull();
        assertThat(repository.history)
                .extracting(ProModuleSnapshot::state)
                .contains(ProModuleState.ROLLING_BACK)
                .doesNotContain(ProModuleState.ACTIVE);
    }

    @Test
    void retainedUseKeepsActiveDigestAndSuppressesUpdates() {
        InMemoryRepository repository =
                new InMemoryRepository(activeSnapshot(
                        ProModuleState.ACTIVE,
                        false));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        Fixture fixture = fixture(repository, runtime, false);
        ProEntitlementStatus retained = entitlement(
                ProEntitlementState.RETAINED_USE,
                true,
                false);

        var status = fixture.manager.status(retained);

        assertThat(status.state()).isEqualTo(
                ProModuleState.RETAINED_USE);
        assertThat(status.activeDigest()).isEqualTo(ACTIVE_DIGEST);
        assertThatThrownBy(() ->
                fixture.manager.installOrUpdate(
                        new ProModuleManager.ProModuleAuthorization(
                                retained,
                                "staging")))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo("retained_use_update_suppressed");
        assertThat(runtime.calls).isEmpty();
        assertThat(repository.load().activeDigest())
                .isEqualTo(ACTIVE_DIGEST);
    }

    @Test
    void entitlementDowngradeDiscardsPendingCandidateAuthority() {
        InMemoryRepository repository = new InMemoryRepository(
                snapshot(ProModuleState.RELEASE_AVAILABLE, true, true));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        Fixture fixture = fixture(repository, runtime, false);

        var retained = fixture.manager.status(entitlement(
                ProEntitlementState.RETAINED_USE,
                true,
                false));

        assertThat(retained.state())
                .isEqualTo(ProModuleState.RETAINED_USE);
        assertThat(repository.load().activeDigest())
                .isEqualTo(ACTIVE_DIGEST);
        assertThat(repository.load().candidateDigest()).isNull();
        assertThat(repository.load().candidateEnvelope()).isNull();
        assertThat(runtime.calls).isEmpty();
    }

    @Test
    void restoredUpdateAuthorityReturnsUninstalledStateToBaseline() {
        InMemoryRepository repository = new InMemoryRepository(
                snapshot(
                        ProModuleState.UPDATE_INELIGIBLE,
                        false,
                        false));
        Fixture fixture = fixture(
                repository,
                new FakeRuntime(repository, true),
                false);

        var status = fixture.manager.status(
                entitlement(ProEntitlementState.ACTIVE, true, true));

        assertThat(status.state())
                .isEqualTo(ProModuleState.NOT_INSTALLED);
        assertThat(repository.load().activeDigest()).isNull();
    }

    @Test
    void releaseCheckClearsCandidateWhenAssignmentIsWithdrawn() {
        InMemoryRepository repository = new InMemoryRepository(
                snapshot(ProModuleState.RELEASE_AVAILABLE, true, true));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        Fixture fixture = fixture(repository, runtime, false, false);

        AutarkOsJob job = fixture.manager.checkForRelease(
                authorization());
        fixture.jobs.runQueuedJobsNow();

        assertThat(fixture.jobs.findById(job.jobId()).orElseThrow()
                .status()).isEqualTo("succeeded");
        assertThat(repository.load().state())
                .isEqualTo(ProModuleState.ACTIVE);
        assertThat(repository.load().candidateDigest()).isNull();
        assertThat(repository.load().candidateEnvelope()).isNull();
        assertThat(runtime.calls).isEmpty();
    }

    @Test
    void restartRecoverySafelyHandlesEveryInProgressState() {
        assertRecovery(
                ProModuleState.DOWNLOADING,
                true,
                ProModuleState.RELEASE_AVAILABLE,
                "discard");
        assertRecovery(
                ProModuleState.VERIFYING,
                true,
                ProModuleState.RELEASE_AVAILABLE,
                "discard");
        assertRecovery(
                ProModuleState.STARTING_CANDIDATE,
                true,
                ProModuleState.ACTIVE,
                "rollback");
        assertRecovery(
                ProModuleState.HEALTH_CHECKING,
                true,
                ProModuleState.ACTIVE,
                "rollback");
        assertRecovery(
                ProModuleState.ROLLING_BACK,
                true,
                ProModuleState.ACTIVE,
                "rollback");
        assertRecovery(
                ProModuleState.REMOVING,
                false,
                ProModuleState.NOT_INSTALLED,
                "remove");

        InMemoryRepository firstInstall =
                new InMemoryRepository(snapshot(
                        ProModuleState.HEALTH_CHECKING,
                        false,
                        true));
        FakeRuntime runtime = new FakeRuntime(firstInstall, true);
        Fixture fixture = fixture(firstInstall, runtime, false);
        fixture.manager.recoverInterruptedState();
        assertThat(firstInstall.load().state())
                .isEqualTo(ProModuleState.NOT_INSTALLED);
        assertThat(firstInstall.history)
                .extracting(ProModuleSnapshot::state)
                .doesNotContain(ProModuleState.ACTIVE);
    }

    @Test
    void corruptOptionalStateCannotPreventCeStartup() {
        CorruptRepository repository = new CorruptRepository();
        Fixture fixture = fixture(
                repository,
                new FakeRuntime(repository, true),
                false);

        fixture.manager.recoverOnStartup();
        var status = fixture.manager.status();

        assertThat(status.state()).isEqualTo(ProModuleState.ERROR);
        assertThat(status.errorCode())
                .isEqualTo("module_state_corrupt");
    }

    @Test
    void repeatedActiveFailuresRestorePreviousKnownGoodGeneration() {
        InMemoryRepository repository = new InMemoryRepository(
                snapshot(
                        ProModuleState.ACTIVE,
                        true,
                        false,
                        true));
        FakeRuntime runtime = new FakeRuntime(repository, false);
        Fixture fixture = fixture(repository, runtime, false);

        fixture.manager.monitorActiveRuntime();
        assertThat(repository.load().state())
                .isEqualTo(ProModuleState.DEGRADED);
        fixture.manager.monitorActiveRuntime();
        fixture.manager.monitorActiveRuntime();

        ProModuleSnapshot restored = repository.load();
        assertThat(restored.state())
                .isEqualTo(ProModuleState.ACTIVE);
        assertThat(restored.activeDigest())
                .isEqualTo("sha256:" + "e".repeat(64));
        assertThat(restored.componentVersion())
                .isEqualTo("0.9.0");
        assertThat(restored.agentApiRange())
                .isEqualTo("1.x");
        assertThat(restored.activeManifestFingerprint())
                .isEqualTo("sha256:" + "d".repeat(64));
        assertThat(restored.previousDigest()).isNull();
        assertThat(restored.lastHealthResult())
                .isEqualTo("crash_loop_rollback");
        assertThat(runtime.calls)
                .containsSubsequence(
                        "active-health",
                        "active-health",
                        "active-health",
                        "rollback");
    }

    @Test
    void activeFailureWithoutRollbackGenerationStaysRecoverable() {
        InMemoryRepository repository = new InMemoryRepository(
                snapshot(
                        ProModuleState.ACTIVE,
                        true,
                        false,
                        false));
        FakeRuntime runtime = new FakeRuntime(repository, false);
        Fixture fixture = fixture(repository, runtime, false);

        fixture.manager.monitorActiveRuntime();
        fixture.manager.monitorActiveRuntime();
        fixture.manager.monitorActiveRuntime();

        assertThat(repository.load().state())
                .isEqualTo(ProModuleState.DEGRADED);
        assertThat(repository.load().activeDigest())
                .isEqualTo(ACTIVE_DIGEST);
        assertThat(runtime.calls)
                .doesNotContain("rollback");
    }

    @Test
    void restartFinishesAnInterruptedActiveCrashLoopRollback() {
        InMemoryRepository repository = new InMemoryRepository(
                snapshot(
                        ProModuleState.ROLLING_BACK,
                        true,
                        false,
                        true));
        FakeRuntime runtime = new FakeRuntime(repository, false);
        Fixture fixture = fixture(repository, runtime, false);

        ProModuleSnapshot recovered =
                fixture.manager.recoverInterruptedState();

        assertThat(recovered.state())
                .isEqualTo(ProModuleState.ACTIVE);
        assertThat(recovered.activeDigest())
                .isEqualTo("sha256:" + "e".repeat(64));
        assertThat(recovered.previousDigest()).isNull();
        assertThat(runtime.calls)
                .containsSubsequence("rollback", "reconcile");
    }

    @Test
    void stableActiveRestartReconcilesExactlyOneRoutingTarget() {
        InMemoryRepository repository = new InMemoryRepository(
                snapshot(
                        ProModuleState.ACTIVE,
                        true,
                        false,
                        false));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        Fixture fixture = fixture(repository, runtime, false);

        fixture.manager.recoverInterruptedState();

        assertThat(runtime.calls).containsExactly("reconcile");
        assertThat(repository.load().state())
                .isEqualTo(ProModuleState.ACTIVE);
    }

    @Test
    void healthyActiveDiscardsExpiredDistinctRollbackGeneration() {
        InMemoryRepository repository = new InMemoryRepository(
                snapshot(
                        ProModuleState.ACTIVE,
                        true,
                        false,
                        true));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        Fixture fixture = fixture(
                repository,
                runtime,
                false,
                true,
                Duration.ofMinutes(1));

        fixture.manager.monitorActiveRuntime();

        assertThat(repository.load().activeDigest())
                .isEqualTo(ACTIVE_DIGEST);
        assertThat(repository.load().previousDigest()).isNull();
        assertThat(runtime.calls)
                .containsSubsequence(
                        "active-health",
                        "reconcile",
                        "discard-previous");
    }

    private void assertRecovery(
            ProModuleState state,
            boolean candidate,
            ProModuleState expected,
            String runtimeCall) {
        InMemoryRepository repository = new InMemoryRepository(
                snapshot(state, true, candidate));
        FakeRuntime runtime = new FakeRuntime(repository, true);
        Fixture fixture = fixture(repository, runtime, false);

        ProModuleSnapshot recovered =
                fixture.manager.recoverInterruptedState();

        assertThat(recovered.state()).isEqualTo(expected);
        assertThat(runtime.calls).contains(runtimeCall);
        if (List.of(
                        ProModuleState.STARTING_CANDIDATE,
                        ProModuleState.HEALTH_CHECKING)
                .contains(state)) {
            assertThat(repository.history)
                    .extracting(ProModuleSnapshot::state)
                    .contains(ProModuleState.ROLLING_BACK);
        }
    }

    private Fixture fixture(
            ProModuleRepository repository,
            FakeRuntime runtime,
            boolean rejectManifest) {
        return fixture(repository, runtime, rejectManifest, true);
    }

    private Fixture fixture(
            ProModuleRepository repository,
            FakeRuntime runtime,
            boolean rejectManifest,
            boolean releaseAssigned) {
        return fixture(
                repository,
                runtime,
                rejectManifest,
                releaseAssigned,
                Duration.ofDays(7));
    }

    private Fixture fixture(
            ProModuleRepository repository,
            FakeRuntime runtime,
            boolean rejectManifest,
            boolean releaseAssigned,
            Duration rollbackRetention) {
        return fixture(
                repository,
                runtime,
                rejectManifest,
                releaseAssigned,
                rollbackRetention,
                null);
    }

    private Fixture fixture(
            ProModuleRepository repository,
            FakeRuntime runtime,
            boolean rejectManifest,
            boolean releaseAssigned,
            Duration rollbackRetention,
            ProAuditService audit) {
        AutarkOsRuntimeProperties properties =
                new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(
                runtimeRoot.resolve(UUID.randomUUID().toString())
                        .toString());
        AutarkOsJobRepository jobRepository =
                JpaTestRepositories.jobRepository(
                        new RuntimeLayout(properties));
        AutarkOsJobService jobs =
                new AutarkOsJobService(
                        jobRepository,
                        Runnable::run,
                        false);
        DeviceIdentityService identity = identityService();
        StubManifestVerifier verifier =
                new StubManifestVerifier(rejectManifest);
        FakeControlPlane controlPlane =
                new FakeControlPlane(releaseAssigned);
        ProModuleManager manager = new ProModuleManager(
                repository,
                new ProModuleTransitionPolicy(),
                jobs,
                controlPlane,
                identity,
                new DeviceOperationProofFactory(identity),
                verifier,
                audit,
                runtime,
                CLOCK,
                "linux/amd64",
                "1.2.3",
                1,
                rollbackRetention);
        return new Fixture(manager, jobs, verifier);
    }

    private static ProModuleManager.ProModuleAuthorization authorization() {
        return new ProModuleManager.ProModuleAuthorization(
                entitlement(ProEntitlementState.ACTIVE, true, true),
                "staging");
    }

    private static ProEntitlementStatus entitlement(
            ProEntitlementState state,
            boolean localUse,
            boolean updates) {
        return new ProEntitlementStatus(
                "1",
                state,
                "pro_home",
                List.of(
                        "autark-pro.extension"),
                NOW.plus(Duration.ofDays(365)),
                NOW.plus(Duration.ofHours(24)),
                NOW,
                localUse,
                updates,
                updates,
                "sha256:" + "b".repeat(64),
                state.name().toLowerCase());
    }

    private static ProModuleSnapshot activeSnapshot(
            ProModuleState state,
            boolean candidate) {
        return snapshot(state, true, candidate);
    }

    private static ProModuleSnapshot snapshot(
            ProModuleState state,
            boolean active,
            boolean candidate) {
        return snapshot(state, active, candidate, active);
    }

    private static ProModuleSnapshot snapshot(
            ProModuleState state,
            boolean active,
            boolean candidate,
            boolean previous) {
        return new ProModuleSnapshot(
                state,
                "recovery",
                null,
                active ? "autark-pro-agent" : null,
                active ? "1.0.0" : null,
                active ? "1.x" : null,
                active ? ACTIVE_DIGEST : null,
                active ? "sha256:" + "f".repeat(64) : null,
                previous ? "sha256:" + "e".repeat(64) : null,
                previous ? "0.9.0" : null,
                previous ? "1.x" : null,
                previous ? "sha256:" + "d".repeat(64) : null,
                candidate ? CANDIDATE.manifest().digest() : null,
                candidate ? CANDIDATE.manifest().version() : null,
                candidate ? CANDIDATE.manifest().agentApiRange() : null,
                candidate ? CANDIDATE.manifest().sequence() : null,
                candidate ? CANDIDATE.fingerprint() : null,
                candidate ? CANDIDATE.envelope() : null,
                7L,
                active ? "healthy" : "not-checked",
                active ? "healthy" : null,
                NOW.minusSeconds(60),
                null,
                null,
                0,
                NOW);
    }

    private static DeviceIdentityService identityService() {
        DeviceIdentity identity = new DeviceIdentity(
                "1",
                "11111111-1111-4111-8111-111111111111",
                "22222222-2222-4222-8222-222222222222",
                "Ed25519",
                "device-test-key",
                new DevicePublicKey(
                        "OKP",
                        "Ed25519",
                        Base64.getUrlEncoder().withoutPadding()
                                .encodeToString(new byte[32])),
                "sha256:" + "9".repeat(64),
                NOW.minusSeconds(3600),
                NOW.minusSeconds(3600));
        return new DeviceIdentityService() {
            @Override
            public DeviceIdentity current() {
                return identity;
            }

            @Override
            public DeviceChallengeSignature signChallenge(
                    byte[] challenge) {
                return new DeviceChallengeSignature(
                        "Ed25519",
                        identity.keyId(),
                        Base64.getUrlEncoder().withoutPadding()
                                .encodeToString(new byte[64]));
            }

            @Override
            public DeviceIdentity rotateInstallationIdentity(
                    String confirmation) {
                throw new UnsupportedOperationException();
            }
        };
    }

    private record Fixture(
            ProModuleManager manager,
            AutarkOsJobService jobs,
            StubManifestVerifier verifier) {
    }

    private static class InMemoryRepository
            implements ProModuleRepository {

        private ProModuleSnapshot state;
        private final List<ProModuleSnapshot> history =
                new ArrayList<>();

        private InMemoryRepository(ProModuleSnapshot state) {
            this.state = state;
        }

        @Override
        public synchronized ProModuleSnapshot load() {
            return state;
        }

        @Override
        public synchronized ProModuleSnapshot save(
                ProModuleSnapshot snapshot) {
            state = snapshot;
            history.add(snapshot);
            return snapshot;
        }

        @Override
        public synchronized ProModuleSnapshot replaceCorruptState(
                String errorCode,
                String message) {
            state = ProModuleSnapshot.notInstalled(NOW).withState(
                    ProModuleState.ERROR,
                    null,
                    null,
                    "failed",
                    null,
                    errorCode,
                    message,
                    NOW);
            history.add(state);
            return state;
        }
    }

    private static final class CorruptRepository
            extends InMemoryRepository {

        private boolean corrupt = true;

        private CorruptRepository() {
            super(ProModuleSnapshot.notInstalled(NOW));
        }

        @Override
        public synchronized ProModuleSnapshot load() {
            if (corrupt) {
                throw new ProModulePersistenceException(
                        "state unavailable",
                        new IllegalStateException());
            }
            return super.load();
        }

        @Override
        public synchronized ProModuleSnapshot replaceCorruptState(
                String errorCode,
                String message) {
            corrupt = false;
            return super.replaceCorruptState(errorCode, message);
        }
    }

    private static final class FakeRuntime
            implements ProModuleRuntime {

        private final ProModuleRepository repository;
        private final boolean healthy;
        private final List<String> calls = new ArrayList<>();
        private RuntimeException downloadFailure;

        private FakeRuntime(
                ProModuleRepository repository,
                boolean healthy) {
            this.repository = repository;
            this.healthy = healthy;
        }

        private FakeRuntime failDownload() {
            downloadFailure = new ProModuleException(
                    "registry_pull_failed",
                    "The registry pull failed.");
            return this;
        }

        @Override
        public void download(ProModuleCandidate candidate) {
            assertState(ProModuleState.DOWNLOADING);
            calls.add("download");
            if (downloadFailure != null) {
                throw downloadFailure;
            }
        }

        @Override
        public void verifyImage(ProModuleCandidate candidate) {
            assertState(ProModuleState.VERIFYING);
            calls.add("verify");
        }

        @Override
        public void startCandidate(ProModuleCandidate candidate) {
            assertState(ProModuleState.STARTING_CANDIDATE);
            calls.add("start");
        }

        @Override
        public HealthResult healthCheck(
                ProModuleCandidate candidate) {
            assertState(ProModuleState.HEALTH_CHECKING);
            calls.add("health");
            return new HealthResult(
                    healthy,
                    healthy ? "healthy" : "probe_failed");
        }

        @Override
        public void activateCandidate(ProModuleCandidate candidate) {
            assertThat(repository.load().state())
                    .isEqualTo(ProModuleState.HEALTH_CHECKING);
            assertThat(repository.load().health())
                    .isEqualTo("healthy");
            calls.add("activate");
        }

        @Override
        public HealthResult activeHealth(String activeDigest) {
            calls.add("active-health");
            return new HealthResult(
                    healthy,
                    healthy ? "healthy" : "probe_failed");
        }

        @Override
        public void reconcileRouting(String activeDigest) {
            calls.add("reconcile");
        }

        @Override
        public void discardCandidate(String candidateDigest) {
            calls.add("discard");
        }

        @Override
        public void discardPrevious(
                String activeDigest,
                String previousDigest) {
            calls.add("discard-previous");
        }

        @Override
        public void rollback(
                String activeDigest,
                String previousDigest,
                String candidateDigest) {
            assertState(ProModuleState.ROLLING_BACK);
            calls.add("rollback");
        }

        @Override
        public void remove(
                String activeDigest,
                String previousDigest) {
            assertState(ProModuleState.REMOVING);
            calls.add("remove");
        }

        private void assertState(ProModuleState expected) {
            assertThat(repository.load().state()).isEqualTo(expected);
        }
    }

    private static final class FakeControlPlane
            implements ProControlPlaneClient {

        private final boolean releaseAssigned;

        private FakeControlPlane(boolean releaseAssigned) {
            this.releaseAssigned = releaseAssigned;
        }

        @Override
        public RegistrationChallenge createDeviceChallenge(
                ChallengePurpose purpose,
                String deviceId,
                UUID requestId) {
            assertThat(purpose).isEqualTo(
                    ChallengePurpose.RELEASE_CHECK);
            return new RegistrationChallenge(
                    "1",
                    Base64.getUrlEncoder().withoutPadding()
                            .encodeToString(new byte[32]),
                    NOW,
                    NOW.plusSeconds(300),
                    requestId);
        }

        @Override
        public ReleaseCheckResult checkRelease(
                DeviceProofRequest request,
                UUID requestId) {
            return new ReleaseCheckResult(
                    "1",
                    releaseAssigned ? CANDIDATE.envelope() : null,
                    NOW,
                    requestId);
        }

        @Override
        public ActivationTicket startActivation(
                String activationCode,
                UUID requestId) {
            throw unsupported();
        }

        @Override
        public RegistrationChallenge createRegistrationChallenge(
                String activationTicket,
                String deviceId,
                UUID requestId) {
            throw unsupported();
        }

        @Override
        public RegistrationResult registerDevice(
                DeviceRegistrationRequest request,
                UUID requestId) {
            throw unsupported();
        }

        @Override
        public EntitlementDocuments renewEntitlements(
                DeviceProofRequest request,
                UUID requestId) {
            throw unsupported();
        }

        @Override
        public RegistryCredentialResponse issueRegistryCredential(
                RegistryCredentialRequest request,
                UUID requestId) {
            throw unsupported();
        }

        private static UnsupportedOperationException unsupported() {
            return new UnsupportedOperationException();
        }
    }

    private static final class StubManifestVerifier
            extends ReleaseManifestVerifier {

        private final boolean reject;
        private int knownGoodCalls;

        private StubManifestVerifier(boolean reject) {
            super(new EmptyTrustStore(), new EmptyReleaseState(),
                    CANDIDATE.manifest().repository());
            this.reject = reject;
        }

        @Override
        public VerifiedRelease verifyForDownload(
                SignedEnvelopeV1 envelope,
                VerificationContext context) {
            if (reject) {
                throw new com.autarkos.pro.model.ProContractVerificationException(
                        "invalid_signature",
                        "Release signature is invalid.");
            }
            assertThat(context.expectedDigest())
                    .isIn(null, CANDIDATE.manifest().digest());
            return new VerifiedRelease(
                    CANDIDATE.manifest(),
                    CANDIDATE.fingerprint(),
                    ReleaseStateRepository.AcceptanceResult.ACCEPTED);
        }

        @Override
        public void markKnownGood(
                VerifiedRelease release,
                Instant knownGoodAt) {
            knownGoodCalls++;
        }
    }

    private static final class EmptyTrustStore
            implements ReleaseTrustStore {

        @Override
        public PublicKey verificationKey(String keyId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Set<String> keyIds() {
            return Set.of();
        }
    }

    private static final class EmptyReleaseState
            implements ReleaseStateRepository {

        @Override
        public AcceptanceResult accept(AcceptedRelease release) {
            return AcceptanceResult.ACCEPTED;
        }

        @Override
        public void markKnownGood(
                String component,
                String releaseChannel,
                String digest,
                String manifestFingerprint,
                Instant knownGoodAt) {
        }

        @Override
        public boolean isKnownGood(
                String component,
                String releaseChannel,
                String digest,
                String manifestFingerprint) {
            return false;
        }

        @Override
        public OptionalLong highestAcceptedSequence(
                String component,
                String releaseChannel) {
            return OptionalLong.empty();
        }
    }
}
