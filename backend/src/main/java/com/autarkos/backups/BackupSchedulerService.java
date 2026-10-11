package com.autarkos.backups;

import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.jobs.JobConflictException;

@Service
public class BackupSchedulerService {

    private final BackupService backupService;
    private final ActivityLogService activityLogService;
    private final AutarkOsJobService jobs;
    private final boolean enabled;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public BackupSchedulerService(
            BackupService backupService,
            ActivityLogService activityLogService,
            AutarkOsJobService jobs,
            @Value("${autark-os.backups.scheduler.enabled:true}") boolean enabled) {
        this.backupService = backupService;
        this.activityLogService = activityLogService;
        this.jobs = jobs;
        this.enabled = enabled;
    }

    @Scheduled(
            initialDelayString = "${autark-os.backups.scheduler.initial-delay-ms:30000}",
            fixedDelayString = "${autark-os.backups.scheduler.interval-ms:60000}")
    public void runDueRoutineBackup() {
        if (!enabled || !running.compareAndSet(false, true)) {
            return;
        }
        try {
            if (!backupService.automaticBackupDue()) return;
            // Use the same durable execution lane as manual backups. Recheck due state
            // under the recovery coordinator once the worker actually starts.
            jobs.start(AutarkOsStates.JobType.BACKUP, "__routine__", BackupJobs.steps(), () -> {
                var result = backupService.runAutomaticIfDue();
                if (result.isEmpty()) {
                    String message = "No backup was created because the routine is no longer due or another recovery operation is active. The scheduler will check again.";
                    return AutarkOsJobOutcome.succeeded(message, java.util.List.of(
                            AutarkOsJobStep.succeeded("check_schedule", "Checking routine schedule", message)));
                }
                var run = result.orElseThrow();
                if (AutarkOsStates.RestorePointStatus.COMPLETED.equals(run.status())) {
                    activityLogService.success("backup", "scheduled_backup_completed", "Routine backup completed", run.message(), null);
                } else if ("not_applicable".equals(run.status())) {
                    activityLogService.info("backup", "scheduled_backup_not_applicable", "Routine backup not needed", run.message(), null);
                } else {
                    activityLogService.error("backup", "scheduled_backup_failed", "Routine backup failed", run.message(), null, null);
                }
                return BackupJobs.outcome(run);
            });
        } catch (JobConflictException conflict) {
            // Another durable job owns the app-data lane. The existing schedule retries.
        } finally {
            running.set(false);
        }
    }
}
