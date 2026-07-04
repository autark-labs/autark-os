package com.autarkos.backups;

import java.time.Instant;
import java.util.List;

public final class BackupModels {

    private BackupModels() {
    }

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

    public record BackupContract(
            String strategy,
            String label,
            String confidence,
            boolean reviewRequired,
            String summary,
            List<String> details) {
    }

    public record BackupReport(
            String status,
            String headline,
            String summary,
            BackupSettingsSummary settings,
            int totalApps,
            int protectedApps,
            int unprotectedApps,
            int failedBackups,
            long backupStorageBytes,
            String backupRoot,
            List<AppBackupStatus> apps,
            List<RestorePoint> recentRestorePoints,
            Instant checkedAt) {
    }

    public record BackupRunResult(
            String appId,
            String appName,
            String status,
            String message,
            RestorePoint restorePoint,
            Instant completedAt) {
    }

    public record BackupSettingsSummary(
            boolean automaticBackupsEnabled,
            String frequency,
            int retentionDays,
            String backupTime,
            String nextRunLabel,
            String schedulerHealth,
            String schedulerMessage,
            RestorePoint lastRoutineRun,
            RestorePoint lastSuccessfulRoutineRun,
            RestorePoint lastSuccessfulVerification,
            String nextRoutineRun) {
    }

    public record BackupVerificationResult(
            long restorePointId,
            String status,
            String message,
            String checksumSha256,
            String restoreConfidence,
            Instant verifiedAt) {
    }
}
