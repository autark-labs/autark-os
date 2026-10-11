package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class BackupSchedulerServiceTests {
    @TempDir Path root;

    @Test
    void onlyDueWorkCreatesOneDurableJobAndRunsInsideItsRecoveryContext() {
        var backups = mock(BackupService.class);
        var activity = mock(ActivityLogService.class);
        var jobs = jobs();
        var scheduler = new BackupSchedulerService(backups, activity, jobs, true);
        scheduler.runDueRoutineBackup();
        assertThat(jobs.list()).isEmpty();
        when(backups.automaticBackupDue()).thenReturn(true);
        when(backups.runAutomaticIfDue()).thenAnswer(invocation -> {
            assertThat(jobs.executingJobId()).isNotBlank();
            jobs.recordAppRecovery(jobs.executingJobId(), "Homepage", new AutarkOsJobStep.Recovery("homepage", "instance-one", true), "pending", "Resume required");
            return Optional.of(new BackupModels.BackupRunResult("__full__", "All apps", "failed", "Stop observation failed", null, Instant.now()));
        });
        scheduler.runDueRoutineBackup();
        scheduler.runDueRoutineBackup();
        assertThat(jobs.list()).hasSize(1);
        verify(backups, never()).runAutomaticIfDue();
        jobs.runQueuedJobsNow();
        var result = jobs.list().getFirst();
        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.steps()).anyMatch(step -> step.recovery() != null && step.recovery().appId().equals("homepage"));
    }

    @Test
    void disabledSchedulerDoesNotInspectOrDispatch() {
        var backups = mock(BackupService.class);
        var jobs = jobs();
        new BackupSchedulerService(backups, mock(ActivityLogService.class), jobs, false).runDueRoutineBackup();
        verify(backups, never()).automaticBackupDue();
        assertThat(jobs.list()).isEmpty();
    }

    @Test
    void dueStateIsRecheckedInWorkerWithoutClaimingSkippedArchiveSteps() {
        var backups = mock(BackupService.class);
        var jobs = jobs();
        when(backups.automaticBackupDue()).thenReturn(true);
        when(backups.runAutomaticIfDue()).thenReturn(Optional.empty());
        new BackupSchedulerService(backups, mock(ActivityLogService.class), jobs, true).runDueRoutineBackup();
        jobs.runQueuedJobsNow();
        var job = jobs.list().getFirst();
        assertThat(job.status()).isEqualTo("succeeded");
        assertThat(job.steps()).extracting(AutarkOsJobStep::id).containsExactly("check_schedule");
        assertThat(job.steps().getFirst().message()).contains("No backup was created");
    }

    private AutarkOsJobService jobs() {
        var properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(root.toString());
        return new AutarkOsJobService(JpaTestRepositories.jobRepository(new RuntimeLayout(properties)), Runnable::run, false);
    }
}
