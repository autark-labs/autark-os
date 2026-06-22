package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.projectos.apps.ApplicationStateService;
import com.projectos.monitoring.MonitoringMetricsService;

class SystemControllerTests {

    @Test
    void applyingAppDefaultsSchedulesOneApplicationStateRefresh() {
        ProjectSettingsService settingsService = mock(ProjectSettingsService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        ProjectSettings settings = ProjectSettings.defaults("project-os");
        ProjectSettingsAppDefaultsResult expected = new ProjectSettingsAppDefaultsResult(
                true,
                "success",
                "App defaults applied",
                "Applied backup and repair defaults to 2 app(s).",
                2,
                Instant.parse("2026-06-21T12:00:00Z"));
        when(settingsService.applyAppDefaults(settings)).thenReturn(expected);
        SystemController controller = new SystemController(
                mock(SystemSetupService.class),
                mock(SystemMetricsService.class),
                mock(StorageService.class),
                mock(SystemSupportService.class),
                settingsService,
                mock(ProjectVersionService.class),
                mock(MonitoringMetricsService.class),
                mock(SystemDoctorService.class),
                mock(OnboardingService.class),
                applicationStateService);

        ProjectSettingsAppDefaultsResult result = controller.applyAppDefaults(settings);

        assertThat(result).isEqualTo(expected);
        verify(settingsService).applyAppDefaults(settings);
        verify(applicationStateService).refreshInBackground();
    }
}
