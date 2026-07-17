package com.autarkos.backups;

import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;

/** Runs idempotent archive retention independently of the next backup window. */
@Service
public class BackupRetentionSchedulerService {

    private final BackupService backupService;
    private final ActivityLogService activityLogService;
    private final AtomicBoolean pruning = new AtomicBoolean(false);

    public BackupRetentionSchedulerService(BackupService backupService, ActivityLogService activityLogService) {
        this.backupService = backupService;
        this.activityLogService = activityLogService;
    }

    @Scheduled(
            initialDelayString = "${autark-os.backups.retention.initial-delay-ms:120000}",
            fixedDelayString = "${autark-os.backups.retention.interval-ms:21600000}")
    public void pruneRoutineArchives() {
        if (!pruning.compareAndSet(false, true)) {
            return;
        }
        try {
            int removed = backupService.pruneRoutineRetention();
            if (removed > 0) {
                activityLogService.info(
                        "backup",
                        "backup_retention_maintenance",
                        "Cleaned up expired routine restore points",
                        "Autark-OS removed " + removed + " routine restore point(s) while preserving manual checkpoints and the newest verified recovery point.");
            }
        } finally {
            pruning.set(false);
        }
    }
}
