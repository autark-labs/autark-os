package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.RuntimeFileOperations;

class BackupReportServiceTests {
    private final AutarkOsJobService jobs = mock(AutarkOsJobService.class);

    @Test
    void dueAndNextUseTheSamePersistedDailyWindowInTheConfiguredZone() {
        var service = service();
        var settings = settings("daily", "02:00", "America/New_York");
        var before = Instant.parse("2026-01-15T06:30:00Z");
        var after = Instant.parse("2026-01-15T07:30:00Z");
        assertThat(BackupReportService.routineWindow(settings, before)).isEmpty();
        assertThat(service.nextRoutineRun(settings, before)).isEqualTo("2026-01-15T07:00:00Z");
        var window = BackupReportService.routineWindow(settings, after).orElseThrow();
        assertThat(window.startsAt()).isEqualTo(Instant.parse("2026-01-15T07:00:00Z"));
        assertThat(service.nextRoutineRun(settings, after)).isEqualTo(window.startsAt().toString());
        recordAttempt(window, "succeeded");
        assertThat(service.nextRoutineRun(settings, after)).isEqualTo("2026-01-16T07:00:00Z");
    }

    @Test
    void failureConsumesOneWindowAndBusyWorkKeepsItsDueTime() {
        var service = service();
        var settings = settings("daily", "02:00", "UTC");
        var now = Instant.parse("2026-01-15T10:00:00Z");
        var window = BackupReportService.routineWindow(settings, now).orElseThrow();
        recordAttempt(window, "running");
        assertThat(service.nextRoutineRun(settings, now)).isEqualTo("2026-01-15T02:00:00Z");
        recordAttempt(window, "failed");
        assertThat(service.nextRoutineRun(settings, now)).isEqualTo("2026-01-16T02:00:00Z");
    }

    @Test
    void hourlyUsesConfiguredMinuteWithoutWaitingForConfiguredHour() {
        var settings = settings("hourly", "23:15", "UTC");
        var now = Instant.parse("2026-01-15T04:20:00Z");
        var window = BackupReportService.routineWindow(settings, now).orElseThrow();
        assertThat(window.startsAt()).isEqualTo(Instant.parse("2026-01-15T04:15:00Z"));
        recordAttempt(window, "succeeded");
        assertThat(service().nextRoutineRun(settings, now)).isEqualTo("2026-01-15T05:15:00Z");
    }

    @Test
    void weeklyUsesMondayAndDoesNotDriftWithExecutionTime() {
        var settings = settings("weekly", "02:00", "UTC");
        assertThat(BackupReportService.routineWindow(settings, Instant.parse("2026-01-12T01:59:00Z"))).isEmpty();
        var now = Instant.parse("2026-01-15T14:00:00Z");
        var window = BackupReportService.routineWindow(settings, now).orElseThrow();
        assertThat(window.startsAt()).isEqualTo(Instant.parse("2026-01-12T02:00:00Z"));
        recordAttempt(window, "succeeded");
        assertThat(service().nextRoutineRun(settings, now)).isEqualTo("2026-01-19T02:00:00Z");
    }

    @Test
    void springGapMovesTheWindowForwardThenReturnsToConfiguredWallTime() {
        var settings = settings("daily", "02:30", "America/New_York");
        var now = Instant.parse("2026-03-08T07:40:00Z");
        var window = BackupReportService.routineWindow(settings, now).orElseThrow();
        assertThat(window.startsAt()).isEqualTo(Instant.parse("2026-03-08T07:30:00Z"));
        recordAttempt(window, "succeeded");
        assertThat(service().nextRoutineRun(settings, now)).isEqualTo("2026-03-09T06:30:00Z");
    }

    @Test
    void dailyFallOverlapRunsOnceAtEarlierOffsetButHourlyUsesBothElapsedHours() {
        var daily = settings("daily", "01:30", "America/New_York");
        var earlier = Instant.parse("2026-11-01T05:45:00Z");
        var later = Instant.parse("2026-11-01T06:45:00Z");
        assertThat(BackupReportService.routineWindow(daily, earlier)).isEqualTo(BackupReportService.routineWindow(daily, later));
        var hourly = settings("hourly", "02:30", "America/New_York");
        assertThat(BackupReportService.routineWindow(hourly, earlier).orElseThrow().startsAt()).isEqualTo(Instant.parse("2026-11-01T05:30:00Z"));
        assertThat(BackupReportService.routineWindow(hourly, later).orElseThrow().startsAt()).isEqualTo(Instant.parse("2026-11-01T06:30:00Z"));
    }

    @Test
    void manualBackupJobsCannotConsumeOrResetScheduledWindow() {
        var service = service();
        var settings = settings("daily", "02:00", "UTC");
        var now = Instant.parse("2026-01-15T12:00:00Z");
        when(jobs.findById("manual-backup")).thenReturn(Optional.of(job("manual-backup", "succeeded")));
        assertThat(service.nextRoutineRun(settings, now)).isEqualTo("2026-01-15T02:00:00Z");
        var window = BackupReportService.routineWindow(settings, now).orElseThrow();
        recordAttempt(window, "succeeded");
        assertThat(service.nextRoutineRun(settings, now)).isEqualTo("2026-01-16T02:00:00Z");
    }

    private void recordAttempt(BackupReportService.RoutineWindow window, String status) {
        String id = AutarkOsJobService.onceJobId(window.key());
        when(jobs.findById(id)).thenReturn(Optional.of(job(id, status)));
    }

    private AutarkOsJob job(String id, String status) {
        return new AutarkOsJob(id, "backup", "__routine__", status, "", List.of(), Instant.EPOCH, Instant.EPOCH, null);
    }

    private BackupReportService service() {
        return new BackupReportService(mock(InstalledAppRepository.class), mock(BackupRepository.class),
                mock(ProjectSettingsService.class), mock(MarketplaceCatalogService.class), mock(RuntimeFileOperations.class),
                mock(BackupContractService.class), () -> Path.of("/tmp/autark-os-backups"),
                mock(BackupDestinationService.class), app -> "", jobs);
    }

    private ProjectSettings settings(String frequency, String time, String zone) {
        return new ProjectSettings("autark-os", zone, "en-US", "fahrenheit", "MMM d, yyyy", "12-hour",
                true, false, "manifest-default", true, true, frequency, 7, time, Instant.EPOCH);
    }
}
