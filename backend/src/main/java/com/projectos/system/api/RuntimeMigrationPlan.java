package com.projectos.system.api;

import java.time.Instant;
import java.util.List;

public record RuntimeMigrationPlan(
        String status,
        String headline,
        String summary,
        boolean executable,
        String sourcePath,
        String targetPath,
        long sourceUsedBytes,
        long targetUsableBytes,
        String sourceMount,
        String targetMount,
        List<String> affectedPaths,
        List<String> warnings,
        List<String> blockedReasons,
        List<Step> steps,
        List<String> rollbackGuidance,
        Instant plannedAt) {

    public record Step(
            String id,
            String label,
            String detail,
            boolean privileged) {
    }
}
