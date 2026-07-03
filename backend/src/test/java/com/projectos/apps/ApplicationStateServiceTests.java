package com.projectos.apps;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.host.ObservedServiceRepository;
import com.projectos.host.ObservedServiceScanner;
import com.projectos.host.ObservedServiceService;
import com.projectos.host.ObservedServiceView;
import com.projectos.jobs.ProjectOsJob;
import com.projectos.jobs.ProjectOsJobStep;
import com.projectos.marketplace.install.AppInstanceView;
import com.projectos.marketplace.install.AppRuntimeView;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

import java.nio.file.Path;

class ApplicationStateServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void snapshotIncludesEveryPinnedObservedServiceEvenWithoutCatalogMatch() {
        ObservedServiceRepository repository = repository();
        repository.upsert(pinned("manual:gitlab", "gitlab"));
        repository.upsert(pinned("docker:compassionate_mclean", "compassionate_mclean"));
        repository.upsert(found("docker:vaultwarden", "vaultwarden"));
        ObservedServiceService observedServiceService = new ObservedServiceService(repository, noScan());
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                List::of,
                observedServiceService,
                null,
                Instant::now);

        ApplicationState state = service.refreshNow();

        assertThat(state.pinnedExternalServices())
                .extracting(ObservedServiceView::id)
                .containsExactlyInAnyOrder("manual:gitlab", "docker:compassionate_mclean");
    }

    @Test
    void snapshotDoesNotRunLiveSuppliers() {
        AtomicInteger managedCalls = new AtomicInteger();
        ApplicationStateService service = new ApplicationStateService(
                () -> {
                    managedCalls.incrementAndGet();
                    return List.of(appInstance());
                },
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        service.snapshot();
        service.snapshot();

        assertThat(managedCalls).hasValue(0);
        assertThat(service.snapshot().refreshStatus()).isEqualTo("stale");
    }

    @Test
    void explicitRefreshBuildsAndCachesProjection() {
        AtomicInteger managedCalls = new AtomicInteger();
        ApplicationStateService service = new ApplicationStateService(
                () -> {
                    managedCalls.incrementAndGet();
                    return List.of(appInstance());
                },
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        ApplicationState refreshed = service.refreshNow();
        ApplicationState cached = service.snapshot();

        assertThat(managedCalls).hasValue(1);
        assertThat(refreshed.managedApps()).hasSize(1);
        assertThat(cached).isSameAs(refreshed);
        assertThat(cached.refreshStatus()).isEqualTo("idle");
        assertThat(cached.stale()).isFalse();
    }

    @Test
    void explicitRefreshRefreshesObservedServicesBeforeBuildingProjection() {
        ObservedServiceRepository repository = repository();
        repository.upsert(pinned("manual:gitlab", "gitlab"));
        CountingObservedServiceService observedServiceService = new CountingObservedServiceService(repository);
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                List::of,
                observedServiceService,
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        ApplicationState state = service.refreshNow();

        assertThat(observedServiceService.refreshCalls).hasValue(1);
        assertThat(state.observedServices())
                .extracting(ObservedServiceView::id)
                .containsExactly("manual:gitlab");
    }

    @Test
    void snapshotDuringRefreshReturnsPreviousProjectionWithoutWaiting() throws Exception {
        CountDownLatch refreshStarted = new CountDownLatch(1);
        CountDownLatch releaseRefresh = new CountDownLatch(1);
        AtomicReference<List<AppInstanceView>> managed = new AtomicReference<>(List.of(appInstance()));
        ApplicationStateService service = new ApplicationStateService(
                () -> managed.get(),
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"));
        ApplicationState previous = service.refreshNow();
        managed.set(List.of(blockingAppInstance(refreshStarted, releaseRefresh)));

        Thread refreshThread = new Thread(service::refreshNow);
        refreshThread.start();

        assertThat(refreshStarted.await(2, TimeUnit.SECONDS)).isTrue();
        ApplicationState duringRefresh = service.snapshot();
        releaseRefresh.countDown();
        refreshThread.join(2_000);

        assertThat(duringRefresh).isSameAs(previous);
        assertThat(service.snapshot().managedApps())
                .extracting(AppInstanceView::catalogAppId)
                .containsExactly("vaultwarden");
    }

    @Test
    void backgroundRefreshUsesProvidedExecutorInsteadOfRunningInline() {
        AtomicInteger managedCalls = new AtomicInteger();
        RecordingExecutor executor = new RecordingExecutor();
        ApplicationStateService service = new ApplicationStateService(
                () -> {
                    managedCalls.incrementAndGet();
                    return List.of(appInstance());
                },
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                executor);

        service.refreshInBackground();

        assertThat(executor.tasks).hasSize(1);
        assertThat(managedCalls).hasValue(0);

        executor.runNext();

        assertThat(managedCalls).hasValue(1);
        assertThat(service.snapshot().refreshStatus()).isEqualTo("idle");
    }

    @Test
    void backgroundRefreshRequestsCoalesceWhileQueued() {
        AtomicInteger managedCalls = new AtomicInteger();
        RecordingExecutor executor = new RecordingExecutor();
        ApplicationStateService service = new ApplicationStateService(
                () -> {
                    managedCalls.incrementAndGet();
                    return List.of(appInstance());
                },
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                executor);

        service.refreshInBackground();
        service.refreshInBackground();
        service.refreshInBackground();

        assertThat(executor.tasks).hasSize(1);

        executor.runNext();

        assertThat(managedCalls).hasValue(1);
    }

    @Test
    void backgroundRefreshMarksCachedProjectionAsRunningWhileQueued() {
        RecordingExecutor executor = new RecordingExecutor();
        ApplicationStateService service = new ApplicationStateService(
                () -> List.of(appInstance()),
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                executor);
        ApplicationState previous = service.refreshNow();

        service.refreshInBackground();

        ApplicationState queued = service.snapshot();
        assertThat(queued.managedApps()).isEqualTo(previous.managedApps());
        assertThat(queued.refreshStatus()).isEqualTo("running");
        assertThat(queued.stale()).isTrue();
        assertThat(queued.refreshStartedAt()).isEqualTo(Instant.parse("2026-06-21T12:00:00Z"));

        executor.runNext();

        assertThat(service.snapshot().refreshStatus()).isEqualTo("idle");
        assertThat(service.snapshot().stale()).isFalse();
    }

    @Test
    void snapshotOverlaysLifecycleOperationOnTargetAppAndPreservesOrder() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("syncthing", "Syncthing")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restart-1", "restart_app", "syncthing", "running", "wait_until_ready")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps())
                .extracting(AppRuntimeView::appId)
                .containsExactly("homepage", "syncthing");
        assertThat(state.runtimeApps())
                .extracting(AppRuntimeView::sortKey)
                .containsExactly("managed:homepage", "managed:syncthing");
        assertThat(state.runtimeApps())
                .extracting(AppRuntimeView::displayOrder)
                .containsExactly(0, 1);
        assertThat(state.runtimeApps().getFirst().operationState().kind()).isEqualTo("idle");
        assertThat(state.runtimeApps().get(1).operationState().kind()).isEqualTo("restarting");
        assertThat(state.runtimeApps().get(1).readinessState()).isEqualTo("starting");
    }

    @Test
    void snapshotOverlaysRepairJobOnTargetApp() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("syncthing", "Syncthing", "Unavailable")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("repair-1", "repair_app", "syncthing", "running", "run_repair")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps().getFirst().operationState().kind()).isEqualTo("repairing");
        assertThat(state.runtimeApps().getFirst().operationState().label()).isEqualTo("Repairing");
        assertThat(state.runtimeApps().getFirst().availableActions()).isEmpty();
    }

    @Test
    void snapshotOverlaysBackupJobOnTargetApp() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("backup-1", "backup", "vaultwarden", "running", "copy_data")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps().getFirst().operationState().kind()).isEqualTo("idle");
        assertThat(state.runtimeApps().get(1).operationState().kind()).isEqualTo("backing_up");
        assertThat(state.runtimeApps().get(1).operationState().label()).isEqualTo("Creating backup");
        assertThat(state.runtimeApps().get(1).availableActions()).isEmpty();
    }

    @Test
    void snapshotOverlaysRestoreJobOnTargetApp() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restore-1", "backup_restore", "42:vaultwarden", "running", "restore_data")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps().getFirst().operationState().kind()).isEqualTo("idle");
        assertThat(state.runtimeApps().get(1).operationState().kind()).isEqualTo("restoring");
        assertThat(state.runtimeApps().get(1).operationState().label()).isEqualTo("Restoring");
        assertThat(state.runtimeApps().get(1).availableActions()).isEmpty();
    }

    @Test
    void snapshotOverlaysFullRestoreJobOnEveryManagedApp() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restore-1", "backup_restore", "42:all", "running", "restore_data")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps())
                .extracting(app -> app.operationState().kind())
                .containsExactly("restoring", "restoring");
        assertThat(state.runtimeApps())
                .extracting(app -> app.operationState().label())
                .containsExactly("Restoring", "Restoring");
    }

    @Test
    void snapshotDoesNotPinFailedFullRestoreOnEveryManagedApp() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restore-1", "backup_restore", "42:all", "failed", "restore_data")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps())
                .extracting(app -> app.operationState().kind())
                .containsExactly("idle", "idle");
        assertThat(state.runtimeApps().getFirst().availableActions())
                .extracting(action -> action.id())
                .contains("stop", "restart");
        assertThat(state.runtimeApps().get(1).availableActions())
                .extracting(action -> action.id())
                .contains("stop", "restart");
    }

    @Test
    void snapshotKeepsFailedTargetedRestoreVisibleOnTargetApp() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("homepage", "Homepage"), runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("restore-1", "backup_restore", "42:vaultwarden", "failed", "restore_data")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps().getFirst().operationState().kind()).isEqualTo("idle");
        assertThat(state.runtimeApps().get(1).operationState().kind()).isEqualTo("failed");
        assertThat(state.runtimeApps().get(1).operationState().label()).isEqualTo("Restoring");
    }

    @Test
    void snapshotKeepsFailedBackupVisibleOnReadyApp() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("vaultwarden", "Vaultwarden")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("backup-failed", "backup", "vaultwarden", "failed", "copy_data")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps().getFirst().operationState().kind()).isEqualTo("failed");
        assertThat(state.runtimeApps().getFirst().operationState().label()).isEqualTo("Creating backup");
    }

    @Test
    void snapshotOnlyIncludesRepairActionWhenCanonicalStateNeedsRemediation() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(
                        runtimeApp("homepage", "Homepage"),
                        runtimeApp("syncthing", "Syncthing", "Unavailable")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.<ProjectOsJob>of());

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps().getFirst().availableActions())
                .extracting(action -> action.id())
                .doesNotContain("repair");
        assertThat(state.runtimeApps().get(1).availableActions())
                .extracting(action -> action.id())
                .contains("repair");
    }

    @Test
    void snapshotIgnoresOlderFailedLifecycleJobAfterNewerSuccess() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("syncthing", "Syncthing")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(
                        lifecycleJob("restart-success", "restart_app", "syncthing", "succeeded", "wait_until_ready", "2026-06-21T12:01:00Z"),
                        lifecycleJob("restart-failed", "restart_app", "syncthing", "failed", "wait_until_ready", "2026-06-21T12:00:00Z")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps().getFirst().operationState().kind()).isEqualTo("idle");
        assertThat(state.runtimeApps().getFirst().readinessState()).isEqualTo("ready");
    }

    @Test
    void snapshotDoesNotSurfaceFailedLifecycleJobWhenRuntimeIsHealthyOrStarting() {
        ApplicationStateService healthyService = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("syncthing", "Syncthing")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("start-failed", "start_app", "syncthing", "failed", "wait_until_ready")));
        ApplicationState startingState = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("syncthing", "Syncthing", "Starting")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("start-failed", "start_app", "syncthing", "failed", "wait_until_ready"))).refreshNow();

        assertThat(healthyService.refreshNow().runtimeApps().getFirst().operationState().kind()).isEqualTo("idle");
        assertThat(startingState.runtimeApps().getFirst().operationState().kind()).isEqualTo("idle");
        assertThat(startingState.runtimeApps().getFirst().readinessState()).isEqualTo("starting");
    }

    @Test
    void snapshotSurfacesFailedLifecycleJobWhenRuntimeStillNeedsAttention() {
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                () -> List.of(runtimeApp("syncthing", "Syncthing", "Unavailable")),
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                () -> List.of(lifecycleJob("start-failed", "start_app", "syncthing", "failed", "wait_until_ready")));

        ApplicationState state = service.refreshNow();

        assertThat(state.runtimeApps().getFirst().operationState().kind()).isEqualTo("failed");
    }

    private ObservedServiceScanner noScan() {
        return new ObservedServiceScanner(List::of, () -> new com.projectos.system.ProjectOsIdentity("", "project-os", "", "", Instant.EPOCH, 1));
    }

    private com.projectos.host.ObservedService pinned(String id, String name) {
        return service(id, name, "pinned");
    }

    private com.projectos.host.ObservedService found(String id, String name) {
        return service(id, name, "visible");
    }

    private com.projectos.host.ObservedService service(String id, String name, String visibility) {
        return new com.projectos.host.ObservedService(
                id,
                "docker",
                id,
                name,
                null,
                "External",
                "LAN",
                null,
                "unknown",
                "external",
                visibility,
                "running",
                false,
                "",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z"),
                "pinned".equals(visibility) ? Instant.parse("2026-06-21T12:00:00Z") : null,
                null,
                "{}");
    }

    private AppInstanceView appInstance() {
        return new AppInstanceView(
                "appinst_homepage",
                "homepage",
                "Homepage",
                "Dashboards",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                "local_ready",
                "backup_disabled",
                "http://localhost:3005",
                null,
                List.of(),
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z"));
    }

    private AppInstanceView blockingAppInstance(CountDownLatch started, CountDownLatch release) {
        started.countDown();
        try {
            release.await(2, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
        return new AppInstanceView(
                "appinst_vaultwarden",
                "vaultwarden",
                "Vaultwarden",
                "Security",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                "local_ready",
                "backup_disabled",
                "http://localhost:3006",
                null,
                List.of(),
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z"));
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
                friendlyStatus,
                "running",
                "healthy",
                "/runtime/apps/" + appId,
                "project-os-" + appId,
                "http://localhost:3000",
                null,
                null,
                null,
                Instant.parse("2026-06-21T12:00:00Z"),
                "Backups disabled",
                null,
                null,
                null,
                null,
                null,
                List.of(),
                List.of());
    }

    private ProjectOsJob lifecycleJob(String jobId, String type, String subjectId, String status, String currentStep) {
        return lifecycleJob(jobId, type, subjectId, status, currentStep, "2026-06-21T12:00:01Z");
    }

    private ProjectOsJob lifecycleJob(String jobId, String type, String subjectId, String status, String currentStep, String updatedAt) {
        return new ProjectOsJob(
                jobId,
                type,
                subjectId,
                status,
                currentStep,
                List.of(
                        ProjectOsJobStep.pending("run_command", "Run app command"),
                        ProjectOsJobStep.running("wait_until_ready", "Wait for app readiness", "Waiting for the app to report ready.")),
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse(updatedAt),
                null);
    }

    private ObservedServiceRepository repository() {
        return new ObservedServiceRepository(runtimeLayout());
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
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
        public List<ObservedServiceView> refresh() {
            refreshCalls.incrementAndGet();
            return super.list(true);
        }
    }
}
