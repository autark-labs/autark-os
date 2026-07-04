package com.autarkos.marketplace.install.models;

import java.time.Instant;
import java.util.List;

import com.autarkos.marketplace.install.AppRuntimeView;

public final class UpdateModels {

    private UpdateModels() {
    }

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

    public record AppUpdateResult(
            String appId,
            String appName,
            String status,
            String message,
            List<String> logs,
            AppRuntimeView app,
            Instant completedAt) {
    }

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
}
