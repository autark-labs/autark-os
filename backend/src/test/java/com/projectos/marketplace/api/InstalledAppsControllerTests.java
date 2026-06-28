package com.projectos.marketplace.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.projectos.apps.ApplicationStateService;
import com.projectos.apps.ApplicationState;
import com.projectos.jobs.ProjectOsJob;
import com.projectos.jobs.ProjectOsJobRepository;
import com.projectos.jobs.ProjectOsJobService;
import com.projectos.marketplace.install.AppActionResult;
import com.projectos.marketplace.install.AppRuntimeView;
import com.projectos.marketplace.install.AppLifecycleService;
import com.projectos.marketplace.install.AppTelemetry;
import com.projectos.marketplace.install.AppUpdateService;
import com.projectos.monitoring.MonitoringMetricsService;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class InstalledAppsControllerTests {

    @Test
    void lifecycleMutationSchedulesCachedApplicationStateRefreshWithoutBlocking() {
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
        AppActionResult result = new AppActionResult("vaultwarden", "start", "completed", "Started.", null, List.of(), Instant.parse("2026-06-21T12:00:00Z"));
        when(lifecycleService.start("vaultwarden")).thenReturn(result);

        controller.start("vaultwarden");

        verify(applicationStateService).refreshInBackground();
        verify(applicationStateService, never()).refreshNow();
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

        Map<String, AppTelemetry> telemetry = controller.telemetry();

        assertThat(telemetry).containsEntry("vaultwarden", app.telemetry());
        verify(lifecycleService, never()).telemetry();
    }

    @Test
    void uninstallEndpointReturnsDurableJobWithoutRemovingAppSynchronously() {
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        MonitoringMetricsService metricsService = mock(MonitoringMetricsService.class);
        AppUpdateService updateService = mock(AppUpdateService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        ProjectOsJobService jobService = jobService();
        InstalledAppsController controller = new InstalledAppsController(
                lifecycleService,
                metricsService,
                updateService,
                applicationStateService,
                jobService);
        AppActionResult result = new AppActionResult("vaultwarden", "uninstall", "removed", "Removed.", null, List.of(), Instant.parse("2026-06-21T12:00:00Z"));
        when(lifecycleService.uninstall("vaultwarden")).thenReturn(result);

        ProjectOsJob job = controller.startUninstall("vaultwarden");

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
        verify(applicationStateService).invalidate();
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
                "project-os-" + appId,
                "http://localhost:8090",
                null,
                null,
                null,
                Instant.parse("2026-06-21T12:00:00Z"),
                "Backups disabled",
                null,
                AppTelemetry.unavailable(),
                null,
                null,
                null,
                List.of(),
                List.of());
    }

    private ProjectOsJobService jobService() {
        try {
            RuntimeLayout layout = new RuntimeLayout(
                    runtimeProperties(java.nio.file.Files.createTempDirectory("project-os-controller-jobs").toString()));
            return new ProjectOsJobService(new ProjectOsJobRepository(layout, () -> Instant.parse("2026-06-21T12:00:00Z")), Runnable::run, false);
        } catch (java.io.IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private ProjectOsRuntimeProperties runtimeProperties(String runtimeRoot) {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot);
        return properties;
    }
}
