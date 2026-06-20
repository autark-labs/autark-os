package com.projectos.backups;

import java.time.Instant;
import java.util.List;

public record RestoreResult(
        long restorePointId,
        String status,
        String message,
        List<String> restoredAppIds,
        List<String> logs,
        Instant completedAt) {
}
