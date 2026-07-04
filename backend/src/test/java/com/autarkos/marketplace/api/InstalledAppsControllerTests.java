package com.autarkos.marketplace.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.autarkos.apps.ApplicationState;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobRepository;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.install.AppActionResult;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.marketplace.install.AppUpdateService;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.monitoring.MonitoringMetricsService;
import com.autarkos.testsupport.JpaTestRepositories;

class InstalledAppsControllerTests {

    @Test
    void lifecycleMutationReturnsDurableJobWithoutImplyingReadiness() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AutarkOsJobService jobService = jobService();
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService);
        AppActionResult result = new AppActionResult("vaultwarden", "start", "completed", "Started.", null, List.of(), Instant.parse("2026-06-21T12:00:00Z"));
        when(lifecycleService.start("vaultwarden")).thenReturn(result);

        AutarkOsJob job = controller.start("vaultwarden");

        assertThat(job.type()).isEqualTo("start_app");
        assertThat(job.subjectId()).isEqualTo("vaultwarden");
        assertThat(job.status()).isEqualTo("queued");
        verify(lifecycleService, never()).start("vaultwarden");
        verify(applicationStateService, never()).refreshInBackground();
        verify(applicationStateService, never()).refreshNow();

        jobService.runQueuedJobsNow();

        verify(lifecycleService).start("vaultwarden");
        verify(applicationStateService, atLeastOnce()).invalidate();
    }

    @Test
    void lifecycleMutationReturnsExistingActiveLifecycleJobForSameApp() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AutarkOsJobService jobService = jobService();
        AutarkOsJob existing = jobService.start(
                "restart_app",
                "vaultwarden",
                List.of(AutarkOsJobStep.pending("run_command", "Restart app")),
                () -> AutarkOsJobOutcome.succeeded("Restarted."));
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService);

        AutarkOsJob returned = controller.start("vaultwarden");

        assertThat(returned.jobId()).isEqualTo(existing.jobId());
        verify(lifecycleService, never()).start("vaultwarden");
    }

    @Test
    void repairMutationReturnsDurableJobAndRunsRepairLater() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AutarkOsJobService jobService = jobService();
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService);
        AppActionResult result = new AppActionResult("vaultwarden", "repair", "completed", "Repair completed.", null, List.of(), Instant.parse("2026-06-21T12:00:00Z"));
        when(lifecycleService.repair("vaultwarden")).thenReturn(result);

        AutarkOsJob job = controller.repair("vaultwarden");

        assertThat(job.type()).isEqualTo("repair_app");
        assertThat(job.subjectId()).isEqualTo("vaultwarden");
        assertThat(job.status()).isEqualTo("queued");
        assertThat(job.steps()).extracting(AutarkOsJobStep::id).containsExactly(
                "inspect_app",
                "run_repair",
                "verify_repair",
                "refresh_app_state");
        verify(lifecycleService, never()).repair("vaultwarden");

        jobService.runQueuedJobsNow();

        verify(lifecycleService).repair("vaultwarden");
        verify(applicationStateService, atLeastOnce()).invalidate();
        verify(applicationStateService, never()).refreshInBackground();
    }

    @Test
    void repairJobFailureKeepsRepairMessageActionable() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AutarkOsJobService jobService = jobService();
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService);
        AppActionResult result = new AppActionResult(
                "syncthing",
                "repair",
                "needs_attention",
                "Syncthing still needs attention after repair.",
                null,
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z"));
        when(lifecycleService.repair("syncthing")).thenReturn(result);

        AutarkOsJob job = controller.repair("syncthing");
        jobService.runQueuedJobsNow();

        AutarkOsJob failed = jobService.findById(job.jobId()).orElseThrow();
        assertThat(failed.status()).isEqualTo("failed");
        assertThat(failed.error()).isNotNull();
        assertThat(failed.error().message()).isEqualTo("Syncthing still needs attention after repair.");
        assertThat(failed.steps())
                .filteredOn(step -> "run_repair".equals(step.id()))
                .extracting(AutarkOsJobStep::status)
                .containsExactly("failed");
    }

    @Test
    void appListReadUsesCachedApplicationState() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AppRuntimeView app = appRuntimeView("vaultwarden");
        when(applicationStateService.snapshot()).thenReturn(applicationStateWith(app));
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService());

        List<AppRuntimeView> apps = controller.apps();

        assertThat(apps).containsExactly(app);
        verify(lifecycleService, never()).listApps();
    }

    @Test
    void telemetryReadUsesCachedRuntimeViews() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AppRuntimeView app = appRuntimeView("vaultwarden");
        when(applicationStateService.snapshot()).thenReturn(applicationStateWith(app));
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService());

        Map<String, RuntimeModels.AppTelemetry> telemetry = controller.telemetry();

        assertThat(telemetry).containsEntry("vaultwarden", app.telemetry());
        verify(lifecycleService, never()).telemetry();
    }

    @Test
    void privateAccessMutationInvalidatesCanonicalAppStateImmediately() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService());
        AppRuntimeView app = appRuntimeView("vaultwarden");
        var refreshedState = applicationStateWith(app);
        AppActionResult result = new AppActionResult(
                "vaultwarden",
                "private-access",
                "completed",
                "Vaultwarden is available privately.",
                app,
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z"));
        when(lifecycleService.enablePrivateAccess("vaultwarden")).thenReturn(result);
        when(applicationStateService.snapshot()).thenReturn(refreshedState);

        AppActionResult returned = controller.enablePrivateAccess("vaultwarden");

        assertThat(returned.applicationState()).isEqualTo(refreshedState);
        verify(applicationStateService).invalidate();
        verify(applicationStateService).snapshot();
        verify(applicationStateService, never()).refreshInBackground();
    }

    @Test
    void settingsMutationInvalidatesCanonicalAppStateImmediately() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService());
        AppRuntimeView app = appRuntimeView("gitea");
        InstallModels.InstallSettings settings = InstallModels.InstallSettings.defaults("http://localhost:3000");
        when(lifecycleService.updateSettings("gitea", settings)).thenReturn(app);

        AppRuntimeView returned = controller.updateSettings("gitea", settings);

        assertThat(returned).isEqualTo(app);
        verify(applicationStateService).invalidate();
        verify(applicationStateService, never()).refreshInBackground();
    }

    @Test
    void uninstallEndpointReturnsDurableJobWithoutRemovingAppSynchronously() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AutarkOsJobService jobService = jobService();
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService);
        AppActionResult result = new AppActionResult("vaultwarden", "uninstall", "removed", "Removed.", null, List.of(), Instant.parse("2026-06-21T12:00:00Z"));
        when(lifecycleService.uninstall("vaultwarden")).thenReturn(result);

        AutarkOsJob job = controller.startUninstall("vaultwarden");

        assertThat(job.type()).isEqualTo("uninstall_app");
        assertThat(job.subjectId()).isEqualTo("vaultwarden");
        assertThat(job.status()).isEqualTo("queued");
        assertThat(job.steps()).extracting(step -> step.id()).containsExactly(
                "load_uninstall_plan",
                "create_safety_checkpoint",
                "stop_remove_compose_project",
                "preserve_data",
                "remove_app_record",
                "refresh_app_state");
        verify(lifecycleService, never()).uninstall("vaultwarden");

        jobService.runQueuedJobsNow();

        verify(lifecycleService).uninstall("vaultwarden");
        verify(applicationStateService, atLeastOnce()).invalidate();
        verify(applicationStateService, never()).refreshInBackground();
    }

    private ApplicationState applicationStateWith(AppRuntimeView app) {
        return new ApplicationState(
                List.of(),
                List.of(app),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z"));
    }

    private AppRuntimeView appRuntimeView(String appId) {
        return new AppRuntimeView(
                appId,
                "Vaultwarden",
                "Security",
                "Passwords",
                "1.0.0",
                "",
                "Ready",
                "running",
                "healthy",
                "/runtime/apps/" + appId,
                "autark-os-" + appId,
                "http://localhost:8090",
                null,
                null,
                null,
                Instant.parse("2026-06-21T12:00:00Z"),
                "Backups disabled",
                null,
                RuntimeModels.AppTelemetry.unavailable(),
                null,
                null,
                null,
                List.of(),
                List.of());
    }

    private AutarkOsJobService jobService() {
        try {
            RuntimeLayout layout = new RuntimeLayout(
                    runtimeProperties(java.nio.file.Files.createTempDirectory("autark-os-controller-jobs").toString()));
            return new AutarkOsJobService(JpaTestRepositories.jobRepository(layout), Runnable::run, false);
        } catch (java.io.IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private AutarkOsRuntimeProperties runtimeProperties(String runtimeRoot) {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot);
        return properties;
    }
}
