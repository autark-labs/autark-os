package com.autarkos.backups;

import java.time.Instant;

public record BackupRunResult(
        String appId,
        String appName,
        String status,
        String message,
        RestorePoint restorePoint,
        Instant completedAt) {
}
