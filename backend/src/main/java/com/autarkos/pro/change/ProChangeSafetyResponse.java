package com.autarkos.pro.change;

import java.time.Instant;
import java.util.List;

public record ProChangeSafetyResponse(
        String schemaVersion,
        String planId,
        String analyzedSnapshotId,
        String targetResourceRef,
        String outcome,
        String headline,
        String summary,
        List<String> reasons,
        Instant analyzedAt,
        Instant expiresAt) {
}
