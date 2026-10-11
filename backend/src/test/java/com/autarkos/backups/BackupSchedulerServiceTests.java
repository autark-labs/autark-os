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
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class BackupSchedulerServiceTests {
    @TempDir Path root;

    @Test
    void eachDueWindowHasOnePersistedAttemptIncludingFailureAndRepeatedDispatch() {
        var backups = mock(BackupService.class);
        var jobs = jobs();
        var scheduler = scheduler(backups, jobs);
        scheduler.runDueRoutineBackup();
        assertThat(jobs.list()).isEmpty();
        when(backups.automaticBackupWindow()).thenReturn(window("2026-01-15T02:00:00Z"));
        when(backups.runScheduledWindow()).thenAnswer(invocation -> {
            assertThat(jobs.executingJobId()).isNotBlank();
            new BackupJobs(jobs).start("stop_apps", "Stopping apps");
            jobs.recordAppRecovery(jobs.executingJobId(), "Homepage", new AutarkOsJobStep.Recovery("homepage", "instance-one", true), "pending", "Resume required");
            return Optional.of(new BackupModels.BackupRunResult("__full__", "All apps", "failed", "Stop observation failed", null, Instant.now()));
        });
        scheduler.runDueRoutineBackup();
        scheduler.runDueRoutineBackup();
        assertThat(jobs.list()).hasSize(1);
        verify(backups, never()).runScheduledWindow();
        jobs.runQueuedJobsNow();
        var result = jobs.list().getFirst();
        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.steps()).anyMatch(step -> step.recovery() != null && step.recovery().appId().equals("homepage"));
        scheduler.runDueRoutineBackup();
        jobs.runQueuedJobsNow();
        assertThat(jobs.list()).hasSize(1);
        verify(backups, times(1)).runScheduledWindow();
    }

    @Test
    void disabledSchedulerDoesNotInspectOrDispatch() {
        var backups = mock(BackupService.class);
        var jobs = jobs();
        new BackupSchedulerService(backups, mock(ActivityLogService.class), jobs, false).runDueRoutineBackup();
        verify(backups, never()).automaticBackupWindow();
        assertThat(jobs.list()).isEmpty();
    }

    @Test
    void disabledBeforeExecutionDoesNotClaimArchiveOrVerificationWork() {
        var backups = mock(BackupService.class);
        var jobs = jobs();
        when(backups.automaticBackupWindow()).thenReturn(window("2026-01-15T02:00:00Z"));
        when(backups.runScheduledWindow()).thenAnswer(ignored -> {
            new BackupJobs(jobs).complete("wait_for_recovery", "Automatic backups were turned off. No archive was created.");
            return Optional.empty();
        });
        scheduler(backups, jobs).runDueRoutineBackup();
        jobs.runQueuedJobsNow();
        var job = jobs.list().getFirst();
        assertThat(job.status()).isEqualTo("succeeded");
        assertThat(job.steps()).extracting(AutarkOsJobStep::id).containsExactly("wait_for_recovery");
        assertThat(job.steps().getFirst().message()).contains("No archive was created");
    }

    @Test
    void busyMutationDoesNotPreventPersistingTheDueWindow() {
        var backups = mock(BackupService.class);
        var jobs = jobs();
        jobs.start("backup_restore", "12:all", List.of(AutarkOsJobStep.pending("restore", "Restoring")), () -> AutarkOsJobOutcome.succeeded("Restored"));
        when(backups.automaticBackupWindow()).thenReturn(window("2026-01-15T02:00:00Z"));
        scheduler(backups, jobs).runDueRoutineBackup();
        assertThat(jobs.activeJobs()).hasSize(2);
        assertThat(jobs.activeJobs()).anyMatch(job -> "__routine__".equals(job.subjectId()));
    }

    @Test
    void restartResumesQueuedWindowsWithSameIdsEvenAfterTheirCalendarWindow() {
        var backups = mock(BackupService.class);
        var firstProcess = jobs();
        when(backups.automaticBackupWindow()).thenReturn(window("2026-01-15T02:00:00Z"));
        scheduler(backups, firstProcess).runDueRoutineBackup();
        String oldId = firstProcess.list().getFirst().jobId();
        var restarted = jobs();
        restarted.reconcileInterruptedJobs();
        when(backups.automaticBackupWindow()).thenReturn(window("2026-01-16T02:00:00Z"));
        when(backups.runScheduledWindow()).thenReturn(Optional.empty());
        scheduler(backups, restarted).runDueRoutineBackup();
        assertThat(restarted.activeJobs()).hasSize(2);
        assertThat(restarted.findById(oldId).orElseThrow().status()).isEqualTo("queued");
        restarted.runQueuedJobsNow();
        verify(backups, times(2)).runScheduledWindow();
        assertThat(restarted.list()).hasSize(2);
    }

    @Test
    void restartResumesAJobThatWasOnlyWaitingForTheRecoveryCoordinator() {
        var backups = mock(BackupService.class);
        var firstProcess = jobs();
        when(backups.automaticBackupWindow()).thenReturn(window("2026-01-15T02:00:00Z"));
        scheduler(backups, firstProcess).runDueRoutineBackup();
        String id = firstProcess.list().getFirst().jobId();
        firstProcess.recordProgress(id, List.of(AutarkOsJobStep.running("wait_for_recovery", "Waiting for other recovery work", "")));
        var restarted = jobs();
        restarted.reconcileInterruptedJobs();
        when(backups.runScheduledWindow()).thenReturn(Optional.empty());
        scheduler(backups, restarted).runDueRoutineBackup();
        assertThat(restarted.findById(id).orElseThrow().status()).isEqualTo("queued");
        restarted.runQueuedJobsNow();
        verify(backups, times(1)).runScheduledWindow();
        assertThat(restarted.list()).hasSize(1);
    }

    @Test
    void restartDoesNotReplayAWindowThatEnteredExecution() {
        var backups = mock(BackupService.class);
        var firstProcess = jobs();
        when(backups.automaticBackupWindow()).thenReturn(window("2026-01-15T02:00:00Z"));
        scheduler(backups, firstProcess).runDueRoutineBackup();
        String id = firstProcess.list().getFirst().jobId();
        firstProcess.recordProgress(id, List.of(AutarkOsJobStep.running("copy_data", "Copying app data", "Copy in progress")));
        var restarted = jobs();
        restarted.reconcileInterruptedJobs();
        scheduler(backups, restarted).runDueRoutineBackup();
        restarted.runQueuedJobsNow();
        verify(backups, never()).runScheduledWindow();
        assertThat(restarted.list()).hasSize(1);
        assertThat(restarted.findById(id).orElseThrow().error().code()).isEqualTo("job_interrupted");
    }

    private Optional<BackupReportService.RoutineWindow> window(String timestamp) {
        return Optional.of(new BackupReportService.RoutineWindow(Instant.parse(timestamp), "routine:daily:UTC:02:00:" + timestamp));
    }

    private BackupSchedulerService scheduler(BackupService backups, AutarkOsJobService jobs) {
        return new BackupSchedulerService(backups, mock(ActivityLogService.class), jobs, true);
    }

    private AutarkOsJobService jobs() {
        var properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(root.toString());
        return new AutarkOsJobService(JpaTestRepositories.jobRepository(new RuntimeLayout(properties)), Runnable::run, false);
    }
}
