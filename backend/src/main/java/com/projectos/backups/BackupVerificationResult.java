package com.projectos.backups;

import java.time.Instant;

public record BackupVerificationResult(
        long restorePointId,
        String status,
        String message,
        String checksumSha256,
        String restoreConfidence,
        Instant verifiedAt) {
}
