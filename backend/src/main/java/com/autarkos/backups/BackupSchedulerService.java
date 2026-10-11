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
            var steps = java.util.List.of(AutarkOsJobStep.pending("wait_for_recovery", "Waiting for other app recovery work"));
            jobs.resumeInterruptedScheduledJobs(AutarkOsStates.JobType.BACKUP, "__routine__", steps, this::runWindow);
            backupService.automaticBackupWindow().ifPresent(window ->
                    jobs.startOnce(window.key(), AutarkOsStates.JobType.BACKUP, "__routine__", steps, this::runWindow));
        } finally {
            running.set(false);
        }
    }

    private AutarkOsJobOutcome runWindow() {
        var result = backupService.runScheduledWindow();
        if (result.isEmpty()) {
            String message = "Automatic backups were turned off before the scheduled window could run. No archive was created.";
            return AutarkOsJobOutcome.succeeded(message, new BackupJobs(jobs).current());
        }
        var run = result.orElseThrow();
        if (AutarkOsStates.RestorePointStatus.COMPLETED.equals(run.status())) {
            activityLogService.success("backup", "scheduled_backup_completed", "Routine backup completed", run.message(), null);
        } else if ("not_applicable".equals(run.status())) {
            activityLogService.info("backup", "scheduled_backup_not_applicable", "Routine backup not needed", run.message(), null);
        } else {
            activityLogService.error("backup", "scheduled_backup_failed", "Routine backup failed", run.message(), null, null);
        }
        return BackupJobs.outcome(run, jobs);
    }
}
