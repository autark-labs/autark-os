package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.Instant;
import java.nio.file.Path;
import java.util.function.Consumer;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import org.junit.jupiter.api.Test;

import com.autarkos.apps.ApplicationStateService;
import com.autarkos.monitoring.MonitoringMetricsService;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class SystemControllerTests {

    @TempDir Path runtimeRoot;

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void cleanupReturnsOneDurableJobAndRecordsRealProgressAndOutcome(boolean failRemoval) {
        var properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        var repository = JpaTestRepositories.jobRepository(new RuntimeLayout(properties));
        var jobs = new AutarkOsJobService(repository, Runnable::run, false);
        var storage = mock(StorageService.class);
        var state = mock(ApplicationStateService.class);
        var controller = new SystemController(null, null, storage, null, null, null, null, null, null, state, jobs);
        Path archive = runtimeRoot.resolve("backups/storage-cleanup/old-app.zip");
        org.mockito.Mockito.when(storage.cleanupOrphan(org.mockito.ArgumentMatchers.eq("old-app"), org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> {
                    var active = jobs.list().getFirst();
                    assertThat(active.status()).isEqualTo("running");
                    assertThat(active.currentStep()).isEqualTo("archive");
                    assertThat(controller.cleanupOrphan("old-app").jobId()).isEqualTo(active.jobId());
                    invocation.<Consumer<Path>>getArgument(1).accept(archive);
                    assertThat(jobs.findById(active.jobId()).orElseThrow().currentStep()).isEqualTo("remove");
                    if (failRemoval) throw new IllegalStateException("Folder removal did not finish.");
                    return archive;
                });
        var accepted = controller.cleanupOrphan("old-app");
        assertThat(accepted.type()).isEqualTo("storage_cleanup");
        assertThat(accepted.status()).isEqualTo("queued");
        assertThat(controller.cleanupOrphan("old-app").jobId()).isEqualTo(accepted.jobId());
        verifyNoInteractions(storage, state);
        jobs.runQueuedJobsNow();
        var saved = new AutarkOsJobService(repository, Runnable::run, false).findById(accepted.jobId()).orElseThrow();
        assertThat(saved.status()).isEqualTo(failRemoval ? "failed" : "succeeded");
        assertThat(saved.steps()).extracting(AutarkOsJobStep::status).containsExactly("succeeded", failRemoval ? "failed" : "succeeded");
        assertThat(saved.steps().getFirst().message()).contains(archive.toString(), "not a Backups restore point");
        verify(state).invalidate();
        verify(storage).cleanupOrphan(org.mockito.ArgumentMatchers.eq("old-app"), org.mockito.ArgumentMatchers.any());
    }

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
                applicationStateService, mock(AutarkOsJobService.class));

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
                applicationStateService, mock(AutarkOsJobService.class));

        assertThat(controller.updateSettings(settings)).isEqualTo(expected);
        verify(settingsService).save(settings);
        verifyNoInteractions(applicationStateService);
    }
}
