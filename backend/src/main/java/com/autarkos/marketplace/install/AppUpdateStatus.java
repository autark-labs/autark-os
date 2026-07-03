package com.autarkos.marketplace.install;

import java.time.Instant;

public record AppUpdateStatus(
        String appId,
        String appName,
        String currentImage,
        String targetImage,
        String currentVersion,
        String targetVersion,
        boolean updateAvailable,
        String updateChannel,
        String releaseNotesUrl,
        String sourceUrl,
        String registryAdvisory,
        String registryStrategy,
        String risk,
        boolean backupRequired,
        String backupCheckpointStatus,
        boolean rollbackAvailable,
        String rollbackSupport,
        Instant checkedAt) {
}
