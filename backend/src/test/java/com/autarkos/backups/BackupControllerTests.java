package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.backups.api.RestoreRequest;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobRepository;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class BackupControllerTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void appBackupReturnsQueuedJobAndInvalidatesApplicationState() {
        BackupService backupService = mock(BackupService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AutarkOsJobService jobService = jobService();
        BackupController controller = new BackupController(backupService, jobService, applicationStateService);
        BackupRunResult result = new BackupRunResult(
                "vaultwarden",
                "Vaultwarden",
                "completed",
                "Backup completed for Vaultwarden.",
                null,
                Instant.parse("2026-06-21T12:00:00Z"));
        when(backupService.run("vaultwarden")).thenReturn(result);

        AutarkOsJob job = controller.run("vaultwarden");

        assertThat(job.type()).isEqualTo("backup");
        assertThat(job.subjectId()).isEqualTo("vaultwarden");
        assertThat(job.status()).isEqualTo("queued");
        assertThat(job.steps()).extracting(AutarkOsJobStep::id)
                .containsExactly("prepare_backup", "copy_data", "verify_backup", "finish");
        verify(backupService, never()).run("vaultwarden");
        verify(applicationStateService, times(1)).invalidate();

        jobService.runQueuedJobsNow();

        AutarkOsJob completed = jobService.findById(job.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("succeeded");
        verify(backupService).run("vaultwarden");
        verify(applicationStateService, times(2)).invalidate();
    }

    @Test
    void verifyRestorePointReturnsQueuedJobWithoutRunningVerificationInline() {
        BackupService backupService = mock(BackupService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AutarkOsJobService jobService = jobService();
        BackupController controller = new BackupController(backupService, jobService, applicationStateService);
        BackupVerificationResult result = new BackupVerificationResult(
                42L,
                "verified",
                "Archive checksum matched.",
                "abc123",
                "high",
                Instant.parse("2026-06-21T12:00:00Z"));
        when(backupService.verify(42L)).thenReturn(result);

        AutarkOsJob job = controller.verify(42L);

        assertThat(job.type()).isEqualTo("backup_verify");
        assertThat(job.subjectId()).isEqualTo("42");
        assertThat(job.status()).isEqualTo("queued");
        assertThat(job.steps()).extracting(AutarkOsJobStep::id)
                .containsExactly("load_restore_point", "verify_archive", "record_result", "finish");
        verify(backupService, never()).verify(42L);

        jobService.runQueuedJobsNow();

        AutarkOsJob completed = jobService.findById(job.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("succeeded");
        assertThat(completed.steps()).extracting(AutarkOsJobStep::status)
                .containsExactly("succeeded", "succeeded", "succeeded", "succeeded");
        verify(backupService).verify(42L);
    }

    @Test
    void restorePointReturnsQueuedJobWithoutRunningRestoreInline() {
        BackupService backupService = mock(BackupService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AutarkOsJobService jobService = jobService();
        BackupController controller = new BackupController(backupService, jobService, applicationStateService);
        RestoreResult result = new RestoreResult(
                42L,
                "completed",
                "Restore completed for Vaultwarden.",
                List.of("vaultwarden"),
                List.of("Restored managed files."),
                Instant.parse("2026-06-21T12:00:00Z"));
        when(backupService.restore(42L, "vaultwarden")).thenReturn(result);

        AutarkOsJob job = controller.restore(42L, new RestoreRequest("vaultwarden"));

        assertThat(job.type()).isEqualTo("backup_restore");
        assertThat(job.subjectId()).isEqualTo("42:vaultwarden");
        assertThat(job.status()).isEqualTo("queued");
        assertThat(job.steps()).extracting(AutarkOsJobStep::id)
                .containsExactly("validate_restore_point", "stop_apps", "create_safety_backup", "restore_data", "start_apps", "finish");
        verify(backupService, never()).restore(42L, "vaultwarden");
        verify(applicationStateService, times(1)).invalidate();

        jobService.runQueuedJobsNow();

        AutarkOsJob completed = jobService.findById(job.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("succeeded");
        assertThat(completed.steps()).extracting(AutarkOsJobStep::status)
                .containsExactly("succeeded", "succeeded", "succeeded", "succeeded", "succeeded", "succeeded");
        verify(backupService).restore(42L, "vaultwarden");
        verify(applicationStateService, times(2)).invalidate();
    }

    @Test
    void restorePointFailsJobWhenAffectedAppsCannotRestart() {
        BackupService backupService = mock(BackupService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        AutarkOsJobService jobService = jobService();
        BackupController controller = new BackupController(backupService, jobService, applicationStateService);
        RestoreResult result = new RestoreResult(
                42L,
                "warning",
                "Data was restored for Vaultwarden, but Autark-OS could not restart it.",
                List.of("vaultwarden"),
                List.of("Restored managed files.", "Autark-OS could not start Vaultwarden: port 8080 is already in use."),
                Instant.parse("2026-06-21T12:00:00Z"));
        when(backupService.restore(42L, "vaultwarden")).thenReturn(result);

        AutarkOsJob job = controller.restore(42L, new RestoreRequest("vaultwarden"));

        jobService.runQueuedJobsNow();

        AutarkOsJob completed = jobService.findById(job.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("failed");
        assertThat(completed.error().message()).contains("could not restart");
        assertThat(completed.steps()).extracting(AutarkOsJobStep::status)
                .containsExactly("succeeded", "succeeded", "succeeded", "succeeded", "failed", "pending");
        assertThat(completed.steps().get(4).message()).contains("could not restart");
    }

    private AutarkOsJobService jobService() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        AutarkOsJobRepository repository = new AutarkOsJobRepository(new RuntimeLayout(properties), () -> Instant.parse("2026-06-21T12:00:00Z"));
        return new AutarkOsJobService(repository, Runnable::run, false);
    }
}
