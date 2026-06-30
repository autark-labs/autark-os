package com.projectos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.backups.api.RestoreRequest;
import com.projectos.apps.ApplicationStateService;
import com.projectos.jobs.ProjectOsJob;
import com.projectos.jobs.ProjectOsJobRepository;
import com.projectos.jobs.ProjectOsJobService;
import com.projectos.jobs.ProjectOsJobStep;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class BackupControllerTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void appBackupReturnsQueuedJobAndInvalidatesApplicationState() {
        BackupService backupService = mock(BackupService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        ProjectOsJobService jobService = jobService();
        BackupController controller = new BackupController(backupService, jobService, applicationStateService);
        BackupRunResult result = new BackupRunResult(
                "vaultwarden",
                "Vaultwarden",
                "completed",
                "Backup completed for Vaultwarden.",
                null,
                Instant.parse("2026-06-21T12:00:00Z"));
        when(backupService.run("vaultwarden")).thenReturn(result);

        ProjectOsJob job = controller.run("vaultwarden");

        assertThat(job.type()).isEqualTo("backup");
        assertThat(job.subjectId()).isEqualTo("vaultwarden");
        assertThat(job.status()).isEqualTo("queued");
        assertThat(job.steps()).extracting(ProjectOsJobStep::id)
                .containsExactly("prepare_backup", "copy_data", "verify_backup", "finish");
        verify(backupService, never()).run("vaultwarden");
        verify(applicationStateService, atLeastOnce()).invalidate();

        jobService.runQueuedJobsNow();

        ProjectOsJob completed = jobService.findById(job.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("succeeded");
        verify(backupService).run("vaultwarden");
        verify(applicationStateService, atLeastOnce()).invalidate();
    }

    @Test
    void verifyRestorePointReturnsQueuedJobWithoutRunningVerificationInline() {
        BackupService backupService = mock(BackupService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        ProjectOsJobService jobService = jobService();
        BackupController controller = new BackupController(backupService, jobService, applicationStateService);
        BackupVerificationResult result = new BackupVerificationResult(
                42L,
                "verified",
                "Archive checksum matched.",
                "abc123",
                "high",
                Instant.parse("2026-06-21T12:00:00Z"));
        when(backupService.verify(42L)).thenReturn(result);

        ProjectOsJob job = controller.verify(42L);

        assertThat(job.type()).isEqualTo("backup_verify");
        assertThat(job.subjectId()).isEqualTo("42");
        assertThat(job.status()).isEqualTo("queued");
        assertThat(job.steps()).extracting(ProjectOsJobStep::id)
                .containsExactly("load_restore_point", "verify_archive", "record_result", "finish");
        verify(backupService, never()).verify(42L);

        jobService.runQueuedJobsNow();

        ProjectOsJob completed = jobService.findById(job.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("succeeded");
        assertThat(completed.steps()).extracting(ProjectOsJobStep::status)
                .containsExactly("succeeded", "succeeded", "succeeded", "succeeded");
        verify(backupService).verify(42L);
    }

    @Test
    void restorePointReturnsQueuedJobWithoutRunningRestoreInline() {
        BackupService backupService = mock(BackupService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        ProjectOsJobService jobService = jobService();
        BackupController controller = new BackupController(backupService, jobService, applicationStateService);
        RestoreResult result = new RestoreResult(
                42L,
                "completed",
                "Restore completed for Vaultwarden.",
                List.of("vaultwarden"),
                List.of("Restored managed files."),
                Instant.parse("2026-06-21T12:00:00Z"));
        when(backupService.restore(42L, "vaultwarden")).thenReturn(result);

        ProjectOsJob job = controller.restore(42L, new RestoreRequest("vaultwarden"));

        assertThat(job.type()).isEqualTo("backup_restore");
        assertThat(job.subjectId()).isEqualTo("42:vaultwarden");
        assertThat(job.status()).isEqualTo("queued");
        assertThat(job.steps()).extracting(ProjectOsJobStep::id)
                .containsExactly("validate_restore_point", "stop_apps", "create_safety_backup", "restore_data", "start_apps", "finish");
        verify(backupService, never()).restore(42L, "vaultwarden");

        jobService.runQueuedJobsNow();

        ProjectOsJob completed = jobService.findById(job.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("succeeded");
        assertThat(completed.steps()).extracting(ProjectOsJobStep::status)
                .containsExactly("succeeded", "succeeded", "succeeded", "succeeded", "succeeded", "succeeded");
        verify(backupService).restore(42L, "vaultwarden");
    }

    private ProjectOsJobService jobService() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        ProjectOsJobRepository repository = new ProjectOsJobRepository(new RuntimeLayout(properties), () -> Instant.parse("2026-06-21T12:00:00Z"));
        return new ProjectOsJobService(repository, Runnable::run, false);
    }
}
