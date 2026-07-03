package com.autarkos.backups;

import java.time.Instant;

public record RestorePoint(
        long id,
        String appId,
        String appName,
        String scope,
        String source,
        String includedAppIds,
        String status,
        String path,
        long sizeBytes,
        String message,
        String verificationStatus,
        String verificationMessage,
        String checksumSha256,
        String restoreConfidence,
        Instant verifiedAt,
        Instant createdAt) {
}
