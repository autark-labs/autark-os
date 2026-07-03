package com.autarkos.backups;

import java.time.Instant;
import java.util.List;

public record AppBackupStatus(
        String appId,
        String appName,
        String status,
        boolean protectedByBackups,
        String backupFrequency,
        int backupRetention,
        BackupContract backupContract,
        String runtimePath,
        long dataSizeBytes,
        RestorePoint latestBackup,
        List<RestorePoint> restorePoints,
        String message,
        String nextBackup,
        Instant checkedAt) {
}
