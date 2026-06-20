package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.List;

public record AppUpdatePlan(
        String appId,
        String appName,
        String currentImage,
        String targetImage,
        String risk,
        boolean updateAvailable,
        String updateChannel,
        String releaseNotesUrl,
        String sourceUrl,
        String registryStrategy,
        String backupCheckpointStatus,
        String rollbackSupport,
        List<String> steps,
        List<String> warnings,
        boolean executable,
        Instant plannedAt) {
}
