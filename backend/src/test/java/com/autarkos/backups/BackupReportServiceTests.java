package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.RuntimeFileOperations;

class BackupReportServiceTests {

    @Test
    void calculatesRoutineWindowsInTheConfiguredTimeZoneAndRecognizesDueBackups() {
        BackupReportService service = service();
        ProjectSettings settings = settings("America/New_York");
        Instant beforeWindow = Instant.parse("2026-01-15T06:30:00Z");
        Instant afterWindow = Instant.parse("2026-01-15T07:30:00Z");

        assertThat(service.nextRoutineRun(settings, null, beforeWindow)).isEqualTo("2026-01-15T07:00:00Z");
        assertThat(service.routineBackupDue(settings, null, beforeWindow)).isFalse();
        assertThat(service.routineBackupDue(settings, null, afterWindow)).isTrue();

        RestorePoint completedRoutine = restorePoint(Instant.parse("2026-01-15T07:05:00Z"));
        assertThat(service.nextRoutineRun(settings, completedRoutine, afterWindow)).isEqualTo("2026-01-16T07:00:00Z");
        assertThat(service.routineBackupDue(settings, completedRoutine, afterWindow)).isFalse();
    }

    private BackupReportService service() {
        BackupDestinationService destinationService = mock(BackupDestinationService.class);
        when(destinationService.current()).thenReturn(new BackupModels.BackupDestination(
                "internal", "ready", "/tmp/autark-os-backups", "/", "filesystem:test", "ext4", true, true,
                Long.MAX_VALUE, false, "Internal backups are ready.", "Choose external drive", Instant.now()));
        return new BackupReportService(
                mock(InstalledAppRepository.class),
                mock(BackupRepository.class),
                mock(ProjectSettingsService.class),
                mock(MarketplaceCatalogService.class),
                mock(RuntimeFileOperations.class),
                mock(BackupContractService.class),
                () -> Path.of("/tmp/autark-os-backups"),
                destinationService);
    }

    private ProjectSettings settings(String timeZone) {
        return new ProjectSettings(
                "autark-os",
                timeZone,
                "en-US",
                "fahrenheit",
                "MMM d, yyyy",
                "12-hour",
                true,
                false,
                "manifest-default",
                true,
                true,
                "daily",
                7,
                "02:00",
                "stable",
                false,
                Instant.parse("2026-01-15T00:00:00Z"));
    }

    private RestorePoint restorePoint(Instant createdAt) {
        return new RestorePoint(1, "__full__", "All apps", "full", "automatic", "", "completed", "", 0, "Completed", "not_checked", "", "", "unknown", null, createdAt);
    }
}
