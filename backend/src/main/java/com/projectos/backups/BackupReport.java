package com.projectos.backups;

import java.time.Instant;
import java.util.List;

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
