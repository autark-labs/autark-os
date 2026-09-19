package com.autarkos.apps;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.host.ObservedServiceRepository;
import com.autarkos.host.ObservedServiceScanner;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.host.ObservedService;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

import java.nio.file.Path;

class ApplicationStateServiceTests {

    @Test
    void oneDockerGenerationFeedsEveryCanonicalConsumerAndFailurePreservesIt() {
        var inventoryCalls = new AtomicInteger();
        var currentInventory = new AtomicReference<>(com.autarkos.testsupport.DockerInventoryTestData.empty());
        var runtimeGeneration = new AtomicReference<com.autarkos.host.DockerInventorySnapshot>();
        ApplicationStateService service = new ApplicationStateService(
                inventory -> {
                    runtimeGeneration.set(inventory);
                    return List.of(runtimeApp("vaultwarden", "Vaultwarden"));
                },
                () -> {
                    inventoryCalls.incrementAndGet();
                    return currentInventory.get();
                },
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                List::of,
                Runnable::run,
                false);

        ApplicationState successful = service.refreshNow();

        assertThat(inventoryCalls).hasValue(1);
        assertThat(runtimeGeneration.get()).isSameAs(currentInventory.get());
        currentInventory.set(com.autarkos.testsupport.DockerInventoryTestData.unavailable("daemon unavailable"));

        ApplicationState failed = service.refreshNow();

        assertThat(inventoryCalls).hasValue(2);
        assertThat(failed.applications()).isEqualTo(successful.applications());
        assertThat(failed.refreshStatus()).isEqualTo("error");
    }

    @Test
    void failedUninstallRemainsVisibleUntilSuccessfulUninstallWithoutRewritingRuntimeReadiness() {
        var failure = lifecycleJob("uninstall-failed", "uninstall_app", "homepage", "failed", "checkpoint", "2026-06-21T12:00:00Z");
        var jobs = new AtomicReference<>(List.of(failure));
        var service = createService(() -> List.of(runtimeApp("homepage", "Homepage")),
                new ObservedServiceService(repository(), noScan()), inventory(),
                () -> Instant.parse("2026-06-21T12:05:00Z"), jobs::get);
        var app = applications(service.refreshNow()).getFirst();
        assertThat(app.runtime().state()).isEqualTo(ApplicationRuntimeState.READY);
        assertThat(app.operation().label()).isEqualTo("Uninstall failed");
        assertThat(app.operation().jobType()).isEqualTo("uninstall_app");
        jobs.set(List.of(lifecycleJob("backup-ok", "backup", "homepage", "succeeded", "archive", "2026-06-21T12:01:00Z"), failure));
        assertThat(applications(service.refreshNow()).getFirst().operation().kind()).isEqualTo("failed");
        jobs.set(List.of(lifecycleJob("uninstall-ok", "uninstall_app", "homepage", "succeeded", "remove", "2026-06-21T12:02:00Z"), failure));
        assertThat(applications(service.refreshNow()).getFirst().operation().kind()).isEqualTo("idle");
        assertThat(jobs.get()).contains(failure);
    }

    @TempDir
    Path runtimeRoot;

    @Test
    void snapshotLeavesRetiredManualLinksDormantButKeepsDockerEvidence() {
        ObservedServiceRepository repository = repository();
        repository.upsert(pinned("manual:gitlab", "gitlab"));
        repository.upsert(pinned("docker:compassionate_mclean", "compassionate_mclean"));
        repository.upsert(found("docker:vaultwarden", "vaultwarden"));
        ObservedServiceService observedServiceService = new ObservedServiceService(repository, null);
        ApplicationStateService service = createService(
                List::of,
                observedServiceService,
                inventory(),
                Instant::now);

        ApplicationState state = service.refreshNow();

        assertThat(evidence(state))
                .extracting(ApplicationEvidence::resourceId)
                .containsExactlyInAnyOrder("docker:compassionate_mclean", "docker:vaultwarden");
    }

    @Test
    void snapshotDoesNotRunLiveSuppliers() {
        AtomicInteger runtimeCalls = new AtomicInteger();
        ApplicationStateService service = createService(
                () -> {
                    runtimeCalls.incrementAndGet();
                    return List.of(runtimeApp("vaultwarden", "Vaultwarden"));
                },
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        service.snapshot();
        service.snapshot();

        assertThat(runtimeCalls).hasValue(0);
        assertThat(service.snapshot().refreshStatus()).isEqualTo("stale");
        assertThat(service.snapshot().updatedAt()).isNull();
        assertThat(service.snapshot().stale()).isTrue();
    }

    @Test
    void explicitRefreshBuildsAndCachesProjection() {
        AtomicInteger runtimeCalls = new AtomicInteger();
        ApplicationStateService service = createService(
                () -> {
                    runtimeCalls.incrementAndGet();
                    return List.of(runtimeApp("vaultwarden", "Vaultwarden"));
                },
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        ApplicationState refreshed = service.refreshNow();
        ApplicationState cached = service.snapshot();

        assertThat(runtimeCalls).hasValue(1);
        assertThat(applications(refreshed)).hasSize(1);
        assertThat(cached).isSameAs(refreshed);
        assertThat(cached.refreshStatus()).isEqualTo("idle");
        assertThat(cached.stale()).isFalse();
    }

    @Test
    void failedInitialRefreshDoesNotMakeTheEmptySnapshotLookSuccessful() {
        ApplicationStateService service = createService(
                () -> {
                    throw new IllegalStateException("Docker inventory unavailable");
                },
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        ApplicationState failed = service.refreshNow();

        assertThat(applications(failed)).isEmpty();
        assertThat(failed.updatedAt()).isNull();
        assertThat(failed.refreshStatus()).isEqualTo("error");
        assertThat(failed.stale()).isTrue();
        assertThat(failed.lastError()).isEqualTo("Docker inventory unavailable");
    }

    @Test
    void failedRefreshPreservesTheLastSuccessfulSnapshotAndMarksItStale() {
        AtomicReference<RuntimeException> failure = new AtomicReference<>();
        ApplicationStateService service = createService(
                () -> {
                    if (failure.get() != null) {
                        throw failure.get();
                    }
                    return List.of(runtimeApp("vaultwarden", "Vaultwarden"));
                },
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"));
        ApplicationState successful = service.refreshNow();
        failure.set(new IllegalStateException("Docker inventory unavailable"));

        ApplicationState failed = service.refreshNow();

        assertThat(applications(failed)).isEqualTo(applications(successful));
        assertThat(failed.updatedAt()).isEqualTo(successful.updatedAt());
        assertThat(failed.refreshStatus()).isEqualTo("error");
        assertThat(failed.stale()).isTrue();
        assertThat(failed.lastError()).isEqualTo("Docker inventory unavailable");
    }

    @Test
    void explicitRefreshRefreshesObservedServicesBeforeBuildingProjection() {
        ObservedServiceRepository repository = repository();
        repository.upsert(pinned("manual:gitlab", "gitlab"));
        CountingObservedServiceService observedServiceService = new CountingObservedServiceService(repository);
        ApplicationStateService service = createService(
                List::of,
                observedServiceService,
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        ApplicationState state = service.refreshNow();

        assertThat(observedServiceService.refreshCalls).hasValue(1);
        assertThat(evidence(state))
                .isEmpty();
    }

    @Test
    void snapshotDuringRefreshReturnsPreviousProjectionWithoutWaiting() throws Exception {
        CountDownLatch refreshStarted = new CountDownLatch(1);
        CountDownLatch releaseRefresh = new CountDownLatch(1);
        AtomicReference<java.util.function.Supplier<List<AppRuntimeView>>> runtime = new AtomicReference<>(
                () -> List.of(runtimeApp("vaultwarden", "Vaultwarden")));
        ApplicationStateService service = createService(
                () -> runtime.get().get(),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"));
        ApplicationState previous = service.refreshNow();
        runtime.set(() -> blockingRuntimeApp(refreshStarted, releaseRefresh));

        Thread refreshThread = new Thread(service::refreshNow);
        refreshThread.start();

        assertThat(refreshStarted.await(2, TimeUnit.SECONDS)).isTrue();
        ApplicationState duringRefresh = service.snapshot();
        releaseRefresh.countDown();
        refreshThread.join(2_000);

        assertThat(duringRefresh).isSameAs(previous);
        assertThat(applications(service.snapshot()))
                .extracting(ApplicationView::id)
                .containsExactly("vaultwarden");
    }

    @Test
    void exclusiveRefreshWaitsAndBuildsFreshStateDuringAnotherRefresh() throws Exception {
        CountDownLatch refreshStarted = new CountDownLatch(1);
        CountDownLatch releaseRefresh = new CountDownLatch(1);
        AtomicReference<java.util.function.Supplier<List<AppRuntimeView>>> runtime = new AtomicReference<>(
                () -> List.of(runtimeApp("vaultwarden", "Vaultwarden")));
        ApplicationStateService service = createService(
                () -> runtime.get().get(),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"));
        ApplicationState previous = service.refreshNow();
        runtime.set(() -> blockingRuntimeApp(refreshStarted, releaseRefresh));

        Thread refreshThread = new Thread(service::refreshNow);
        refreshThread.start();

        assertThat(refreshStarted.await(2, TimeUnit.SECONDS)).isTrue();
        AtomicReference<ApplicationState> exclusiveResult = new AtomicReference<>();
        Thread exclusiveRefresh = new Thread(() -> exclusiveResult.set(service.refreshNowExclusively()));
        exclusiveRefresh.start();
        releaseRefresh.countDown();
        refreshThread.join(2_000);
        exclusiveRefresh.join(2_000);

        assertThat(exclusiveResult.get()).isNotNull().isNotSameAs(previous);
    }

    @Test
    void backgroundRefreshUsesProvidedExecutorInsteadOfRunningInline() {
        AtomicInteger runtimeCalls = new AtomicInteger();
        RecordingExecutor executor = new RecordingExecutor();
        ApplicationStateService service = createService(
                () -> {
                    runtimeCalls.incrementAndGet();
                    return List.of(runtimeApp("vaultwarden", "Vaultwarden"));
                },
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                executor);

        service.refreshInBackground();

        assertThat(executor.tasks).hasSize(1);
        assertThat(runtimeCalls).hasValue(0);

        executor.runNext();

        assertThat(runtimeCalls).hasValue(1);
        assertThat(service.snapshot().refreshStatus()).isEqualTo("idle");
    }

    @Test
    void backgroundRefreshRequestsCoalesceWhileQueued() {
        AtomicInteger runtimeCalls = new AtomicInteger();
        RecordingExecutor executor = new RecordingExecutor();
        ApplicationStateService service = createService(
                () -> {
                    runtimeCalls.incrementAndGet();
                    return List.of(runtimeApp("vaultwarden", "Vaultwarden"));
                },
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                executor);

        service.refreshInBackground();
        service.refreshInBackground();
        service.refreshInBackground();

        assertThat(executor.tasks).hasSize(1);

        executor.runNext();

        assertThat(runtimeCalls).hasValue(1);
    }

    @Test
    void backgroundRefreshMarksCachedProjectionAsRunningWhileQueued() {
        RecordingExecutor executor = new RecordingExecutor();
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                executor);
        ApplicationState previous = service.refreshNow();

        service.refreshInBackground();

        ApplicationState queued = service.snapshot();
        assertThat(applications(queued)).isEqualTo(applications(previous));
        assertThat(queued.refreshStatus()).isEqualTo("running");
        assertThat(queued.stale()).isTrue();
        assertThat(queued.refreshStartedAt()).isEqualTo(Instant.parse("2026-06-21T12:00:00Z"));

        executor.runNext();

        assertThat(service.snapshot().refreshStatus()).isEqualTo("idle");
        assertThat(service.snapshot().stale()).isFalse();
    }

    @Test
    void snapshotOverlaysLifecycleOperationOnTargetAppAndPreservesOrder() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("syncthing", "Syncthing")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restart-1", "restart_app", "syncthing", "running", "wait_until_ready")));

        ApplicationState state = service.refreshNow();

        assertThat(runtimeApps(state))
                .extracting(AppRuntimeView::appId)
                .containsExactly("homepage", "syncthing");
        assertThat(applications(state).getFirst().operation().kind()).isEqualTo("idle");
        assertThat(applications(state).get(1).operation().kind()).isEqualTo("restarting");
        assertThat(runtimeApps(state).get(1).state()).isEqualTo(ApplicationRuntimeState.READY);
    }

    @Test
    void snapshotOverlaysRepairJobOnTargetApp() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("syncthing", "Syncthing", "Unavailable")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("repair-1", "repair_app", "syncthing", "running", "run_repair")));

        ApplicationState state = service.refreshNow();

        assertThat(applications(state).getFirst().operation().kind()).isEqualTo("repairing");
        assertThat(applications(state).getFirst().operation().label()).isEqualTo("Repairing");
        assertThat(applications(state).getFirst().availableActions()).isEmpty();
    }

    @Test
    void snapshotOverlaysBackupJobOnTargetApp() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("backup-1", "backup", "vaultwarden", "running", "copy_data")));

        ApplicationState state = service.refreshNow();

        assertThat(applications(state).getFirst().operation().kind()).isEqualTo("idle");
        assertThat(applications(state).get(1).operation().kind()).isEqualTo("backing_up");
        assertThat(applications(state).get(1).operation().label()).isEqualTo("Creating backup");
        assertThat(applications(state).get(1).availableActions()).isEmpty();
    }

    @Test
    void snapshotOverlaysRestoreJobOnTargetApp() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restore-1", "backup_restore", "42:vaultwarden", "running", "restore_data")));

        ApplicationState state = service.refreshNow();

        assertThat(applications(state).getFirst().operation().kind()).isEqualTo("idle");
        assertThat(applications(state).get(1).operation().kind()).isEqualTo("restoring");
        assertThat(applications(state).get(1).operation().label()).isEqualTo("Restoring");
        assertThat(applications(state).get(1).availableActions()).isEmpty();
    }

    @Test
    void snapshotOverlaysFullRestoreJobOnEveryManagedApp() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restore-1", "backup_restore", "42:all", "running", "restore_data")));

        ApplicationState state = service.refreshNow();

        assertThat(applications(state))
                .extracting(app -> app.operation().kind())
                .containsExactly("restoring", "restoring");
        assertThat(applications(state))
                .extracting(app -> app.operation().label())
                .containsExactly("Restoring", "Restoring");
    }

    @Test
    void snapshotDoesNotPinFailedFullRestoreOnEveryManagedApp() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restore-1", "backup_restore", "42:all", "failed", "restore_data")));

        ApplicationState state = service.refreshNow();

        assertThat(applications(state))
                .extracting(app -> app.operation().kind())
                .containsExactly("idle", "idle");
        assertThat(applications(state).getFirst().availableActions())
                .extracting(action -> action.id())
                .contains("stop", "restart");
        assertThat(applications(state).get(1).availableActions())
                .extracting(action -> action.id())
                .contains("stop", "restart");
    }

    @Test
    void snapshotKeepsFailedTargetedRestoreVisibleOnTargetApp() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restore-1", "backup_restore", "42:vaultwarden", "failed", "restore_data")));

        ApplicationState state = service.refreshNow();

        assertThat(applications(state).getFirst().operation().kind()).isEqualTo("idle");
        assertThat(applications(state).get(1).operation().kind()).isEqualTo("failed");
        assertThat(applications(state).get(1).operation().label()).isEqualTo("Restore failed");
    }

    @Test
    void snapshotKeepsFailedBackupVisibleOnReadyApp() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("backup-failed", "backup", "vaultwarden", "failed", "copy_data")));

        ApplicationState state = service.refreshNow();

        assertThat(applications(state).getFirst().operation().kind()).isEqualTo("failed");
        assertThat(applications(state).getFirst().operation().label()).isEqualTo("Backup failed");
    }

    @Test
    void snapshotOnlyIncludesRepairActionWhenCanonicalStateNeedsRemediation() {
        ApplicationStateService service = createService(
                () -> List.of(
                        runtimeApp("homepage", "Homepage"),
                        runtimeApp("syncthing", "Syncthing", "Unavailable")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.<AutarkOsJob>of());

        ApplicationState state = service.refreshNow();

        assertThat(applications(state).getFirst().availableActions())
                .extracting(action -> action.id())
                .doesNotContain("repair");
        assertThat(applications(state).get(1).availableActions())
                .extracting(action -> action.id())
                .contains("repair");
    }

    @Test
    void snapshotIgnoresOlderFailedLifecycleJobAfterNewerSuccess() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("syncthing", "Syncthing")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(
                        lifecycleJob("restart-success", "restart_app", "syncthing", "succeeded", "wait_until_ready", "2026-06-21T12:01:00Z"),
                        lifecycleJob("restart-failed", "restart_app", "syncthing", "failed", "wait_until_ready", "2026-06-21T12:00:00Z")));

        ApplicationState state = service.refreshNow();

        assertThat(applications(state).getFirst().operation().kind()).isEqualTo("idle");
        assertThat(runtimeApps(state).getFirst().state()).isEqualTo(ApplicationRuntimeState.READY);
    }

    @Test
    void snapshotDoesNotSurfaceFailedLifecycleJobWhenRuntimeIsHealthyOrStarting() {
        ApplicationStateService healthyService = createService(
                () -> List.of(runtimeApp("syncthing", "Syncthing")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("start-failed", "start_app", "syncthing", "failed", "wait_until_ready")));
        ApplicationState startingState = createService(
                () -> List.of(runtimeApp("syncthing", "Syncthing", "Starting")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("start-failed", "start_app", "syncthing", "failed", "wait_until_ready"))).refreshNow();

        assertThat(applications(healthyService.refreshNow()).getFirst().operation().kind()).isEqualTo("idle");
        assertThat(applications(startingState).getFirst().operation().kind()).isEqualTo("idle");
        assertThat(runtimeApps(startingState).getFirst().state()).isEqualTo(ApplicationRuntimeState.STARTING);
    }

    @Test
    void snapshotSurfacesFailedLifecycleJobWhenRuntimeStillNeedsAttention() {
        ApplicationStateService service = createService(
                () -> List.of(runtimeApp("syncthing", "Syncthing", "Unavailable")),
                new ObservedServiceService(repository(), noScan()),
                inventory(),
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("start-failed", "start_app", "syncthing", "failed", "wait_until_ready")));

        ApplicationState state = service.refreshNow();

        assertThat(applications(state).getFirst().operation().kind()).isEqualTo("failed");
    }

    private ApplicationStateService createService(
            java.util.function.Supplier<List<AppRuntimeView>> runtime,
            ObservedServiceService observed,
            ApplicationInventoryService inventory,
            java.util.function.Supplier<Instant> clock) {
        return createService(runtime, observed, inventory, clock,
                (java.util.function.Supplier<List<AutarkOsJob>>) List::of);
    }

    private ApplicationStateService createService(
            java.util.function.Supplier<List<AppRuntimeView>> runtime,
            ObservedServiceService observed,
            ApplicationInventoryService inventory,
            java.util.function.Supplier<Instant> clock,
            java.util.function.Supplier<List<AutarkOsJob>> jobs) {
        return new ApplicationStateService(
                ignored -> runtime.get(),
                com.autarkos.testsupport.DockerInventoryTestData::empty,
                observed, inventory, clock, jobs, Runnable::run, false);
    }

    private ApplicationStateService createService(
            java.util.function.Supplier<List<AppRuntimeView>> runtime,
            ObservedServiceService observed,
            ApplicationInventoryService inventory,
            java.util.function.Supplier<Instant> clock,
            java.util.concurrent.Executor executor) {
        return new ApplicationStateService(
                ignored -> runtime.get(),
                com.autarkos.testsupport.DockerInventoryTestData::empty,
                observed, inventory, clock, List::of, executor, false);
    }

    private ObservedServiceScanner noScan() {
        return new ObservedServiceScanner();
    }

    private ApplicationInventoryService inventory() {
        return new ApplicationInventoryService(null, null, null, null) {
            @Override
            public List<ApplicationView> apps(List<ObservedService> observed, List<AppRuntimeView> runtime, java.util.Map<String, com.autarkos.api.AppOperationView> operations) {
                List<ApplicationView> applications = new ArrayList<>();
                for (AppRuntimeView app : runtime) {
                    applications.add(application(app.appId(), app.appName(), "", app, null,
                            operations.getOrDefault(app.appId(), com.autarkos.api.AppOperationView.idle())));
                }
                for (ObservedService service : observed) {
                    applications.add(new ApplicationView(
                            service.id(), service.displayName(), "Apps", "", "", "",
                            ApplicationRelationship.BLOCKED, "unavailable", "", com.autarkos.api.AppOperationView.idle(), List.of(),
                            "Found on server", "Detected host resource", "neutral", "observed",
                            new ApplicationAction("review_existing", "Review existing service", "route", "/apps", null, false, ""),
                            List.of(), null, evidence(service)));
                }
                return List.copyOf(applications);
            }
        };
    }

    private ApplicationView application(String id, String name, String appInstanceId, AppRuntimeView runtime, ApplicationEvidence evidence,
            com.autarkos.api.AppOperationView operation) {
        return new ApplicationView(
                id, name, "Apps", "", "", "", ApplicationRelationship.MANAGED, "installable",
                appInstanceId, operation, List.of(), "Installed", "Managed by Autark-OS", "success", "success",
                new ApplicationAction("manage", "Manage", "route", "/apps", null, false, ""),
                testActions(runtime, operation), runtime, evidence);
    }

    private List<ApplicationAction> testActions(AppRuntimeView runtime, com.autarkos.api.AppOperationView operation) {
        if (!"idle".equals(operation.kind()) && !"failed".equals(operation.kind())) {
            return List.of();
        }
        List<ApplicationAction> actions = new ArrayList<>();
        actions.add(new ApplicationAction("stop", "Pause", "action", "/stop", "POST", false, ""));
        actions.add(new ApplicationAction("restart", "Restart", "action", "/restart", "POST", false, ""));
        if (runtime.state() == ApplicationRuntimeState.DEGRADED || runtime.state() == ApplicationRuntimeState.MISSING) {
            actions.add(new ApplicationAction("repair", "Repair", "action", "/repair", "POST", false, ""));
        }
        return List.copyOf(actions);
    }

    private List<ApplicationView> applications(ApplicationState state) {
        return state.applications();
    }

    private List<AppRuntimeView> runtimeApps(ApplicationState state) {
        return state.applications().stream().map(ApplicationView::runtime).filter(java.util.Objects::nonNull).toList();
    }

    private List<ApplicationEvidence> evidence(ApplicationState state) {
        return state.applications().stream().map(ApplicationView::evidence).filter(java.util.Objects::nonNull).toList();
    }

    private com.autarkos.host.ObservedService pinned(String id, String name) {
        return service(id, name, "pinned");
    }

    private com.autarkos.host.ObservedService found(String id, String name) {
        return service(id, name, "visible");
    }

    private com.autarkos.host.ObservedService service(String id, String name, String visibility) {
        return new com.autarkos.host.ObservedService(
                id,
                id.startsWith("manual:") ? "manual_url" : "docker",
                id,
                name,
                null,
                "LAN",
                null,
                "unknown",
                "external",
                "running",
                "",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z"),
                "{}");
    }

    private ApplicationEvidence evidence(ObservedService service) {
        return new ApplicationEvidence(service.id(), service.source(), service.url(), service.accessScope(),
                service.ownershipState(), service.runtimeState(), "Conflict", "Detected host resource", "", "", "", "");
    }

    private List<AppRuntimeView> blockingRuntimeApp(CountDownLatch started, CountDownLatch release) {
        started.countDown();
        try {
            release.await(2, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
        return List.of(runtimeApp("vaultwarden", "Vaultwarden"));
    }

    private AppRuntimeView runtimeApp(String appId, String name) {
        return runtimeApp(appId, name, "Ready");
    }

    private AppRuntimeView runtimeApp(String appId, String name, String friendlyStatus) {
        return new AppRuntimeView(
                appId,
                name,
                "Apps",
                name + " app",
                "1.0.0",
                "",
                ApplicationRuntimeState.fromStatus(friendlyStatus),
                "/runtime/apps/" + appId,
                "autark-os-" + appId,
                "http://localhost:3000",
                null,
                null,
                null,
                Instant.parse("2026-06-21T12:00:00Z"),
                "Backups disabled",
                "backup_disabled",
                null,
                null,
                null,
                null,
                null,
                List.of(),
                null,
                List.of());
    }

    private AutarkOsJob lifecycleJob(String jobId, String type, String subjectId, String status, String currentStep) {
        return lifecycleJob(jobId, type, subjectId, status, currentStep, "2026-06-21T12:00:01Z");
    }

    private AutarkOsJob lifecycleJob(String jobId, String type, String subjectId, String status, String currentStep, String updatedAt) {
        return new AutarkOsJob(
                jobId,
                type,
                subjectId,
                status,
                currentStep,
                List.of(
                        AutarkOsJobStep.pending("run_command", "Run app command"),
                        AutarkOsJobStep.running("wait_until_ready", "Wait for app readiness", "Waiting for the app to report ready.")),
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse(updatedAt),
                null);
    }

    private ObservedServiceRepository repository() {
        return JpaTestRepositories.observedServiceRepository(runtimeLayout());
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static final class RecordingExecutor implements java.util.concurrent.Executor {
        private final List<Runnable> tasks = new ArrayList<>();

        @Override
        public void execute(Runnable command) {
            tasks.add(command);
        }

        private void runNext() {
            tasks.removeFirst().run();
        }
    }

    private static final class CountingObservedServiceService extends ObservedServiceService {
        private final AtomicInteger refreshCalls = new AtomicInteger();

        private CountingObservedServiceService(ObservedServiceRepository repository) {
            super(repository, null);
        }

        @Override
        public void refresh(com.autarkos.host.DockerInventorySnapshot inventory) {
            refreshCalls.incrementAndGet();
            super.refresh(inventory);
        }
    }
}
