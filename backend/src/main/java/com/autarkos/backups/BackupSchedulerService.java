package com.autarkos.backups;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;

@Service
public class BackupSchedulerService {

    private final BackupService backupService;
    private final ActivityLogService activityLogService;
    private final boolean enabled;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public BackupSchedulerService(
            BackupService backupService,
            ActivityLogService activityLogService,
            @Value("${autark-os.backups.scheduler.enabled:true}") boolean enabled) {
        this.backupService = backupService;
        this.activityLogService = activityLogService;
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
            Optional<BackupModels.BackupRunResult> result = backupService.runAutomaticIfDue();
            result.ifPresent(run -> {
                if (AutarkOsStates.RestorePointStatus.COMPLETED.equals(run.status())) {
                    activityLogService.success("backup", "scheduled_backup_completed", "Routine backup completed", run.message(), null);
                } else if ("not_applicable".equals(run.status())) {
                    activityLogService.info("backup", "scheduled_backup_not_applicable", "Routine backup not needed", run.message(), null);
                } else {
                    activityLogService.error("backup", "scheduled_backup_failed", "Routine backup failed", run.message(), null, null);
                }
            });
        } finally {
            running.set(false);
        }
    }
}
