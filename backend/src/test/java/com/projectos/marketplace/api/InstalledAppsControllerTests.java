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
import com.projectos.marketplace.install.AppActionResult;
import com.projectos.marketplace.install.AppRuntimeView;
import com.projectos.marketplace.install.AppLifecycleService;
import com.projectos.marketplace.install.AppTelemetry;
import com.projectos.marketplace.install.AppUpdateService;
import com.projectos.monitoring.MonitoringMetricsService;

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
                applicationStateService);
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
                applicationStateService);

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
                applicationStateService);

        Map<String, AppTelemetry> telemetry = controller.telemetry();

        assertThat(telemetry).containsEntry("vaultwarden", app.telemetry());
        verify(lifecycleService, never()).telemetry();
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
}
