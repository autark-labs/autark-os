package com.autarkos.system;

import java.time.Instant;

public record StorageCleanupResult(
        String status,
        String message,
        String removedName,
        String removedPath,
        long removedBytes,
        String safetyCheckpointPath,
        Instant completedAt) {
}
