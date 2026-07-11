package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.autarkos.apps.ApplicationStateService;
import com.autarkos.monitoring.MonitoringMetricsService;

class SystemControllerTests {

    @Test
    void savingChangedAppDefaultsSchedulesOneApplicationStateRefresh() {
        ProjectSettingsService settingsService = mock(ProjectSettingsService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        ProjectSettings settings = ProjectSettings.defaults("autark-os");
        ProjectSettingsAppDefaultsResult appDefaults = new ProjectSettingsAppDefaultsResult(
                true,
                "success",
                "App defaults applied",
                "Applied backup and repair defaults to 2 app(s).",
                2,
                Instant.parse("2026-06-21T12:00:00Z"));
        ProjectSettingsSaveResult expected = new ProjectSettingsSaveResult(settings, appDefaults);
        org.mockito.Mockito.when(settingsService.save(settings)).thenReturn(expected);
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

        ProjectSettingsSaveResult result = controller.updateSettings(settings);

        assertThat(result).isEqualTo(expected);
        verify(settingsService).save(settings);
        verify(applicationStateService).refreshInBackground();
    }

    @Test
    void savingSettingsWithoutChangedAppDefaultsDoesNotRefreshApplications() {
        ProjectSettingsService settingsService = mock(ProjectSettingsService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        ProjectSettings settings = ProjectSettings.defaults("autark-os");
        ProjectSettingsSaveResult expected = new ProjectSettingsSaveResult(
                settings,
                new ProjectSettingsAppDefaultsResult(true, "info", "App defaults unchanged", "Saved appliance settings.", 0, Instant.parse("2026-06-21T12:00:00Z")));
        org.mockito.Mockito.when(settingsService.save(settings)).thenReturn(expected);
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

        assertThat(controller.updateSettings(settings)).isEqualTo(expected);
        verify(settingsService).save(settings);
        verifyNoInteractions(applicationStateService);
    }
}
