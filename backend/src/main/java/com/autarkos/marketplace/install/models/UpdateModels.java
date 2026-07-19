package com.autarkos.marketplace.install.models;

import java.time.Instant;
import java.util.List;
public final class UpdateModels {

    private UpdateModels() {
    }

    public record AppUpdateCapability(
            boolean available,
            String status,
            String headline,
            String summary,
            String reasonCode,
            Instant checkedAt) {

        public static AppUpdateCapability unavailable() {
            return new AppUpdateCapability(
                    false,
                    "unsupported",
                    "App updates are not available yet",
                    "Autark-OS keeps managed app updates disabled until it can preserve saved settings, secrets, access, and recovery state through a reversible update job.",
                    "settings_preserving_updates_not_implemented",
                    Instant.now());
        }

        public static AppUpdateCapability supported() {
            return new AppUpdateCapability(
                    true,
                    "available",
                    "Managed app updates are ready",
                    "Autark-OS plans every update, creates a verified safety checkpoint, and keeps the prior release available for rollback.",
                    "managed_updates_available",
                    Instant.now());
        }
    }

    public record AppUpdatePlan(
            String appId,
            String appName,
            String operation,
            String status,
            String headline,
            String summary,
            String currentVersion,
            String targetVersion,
            boolean canApply,
            boolean safetyBackupRequired,
            boolean rollbackAvailable,
            String rollbackSnapshotId,
            List<String> changes,
            List<String> blockedReasons,
            Instant checkedAt) {

        public static AppUpdatePlan blocked(String appId, String appName, String operation, String headline, String summary, List<String> reasons) {
            return new AppUpdatePlan(
                    appId,
                    appName,
                    operation,
                    "blocked",
                    headline,
                    summary,
                    "",
                    "",
                    false,
                    true,
                    false,
                    "",
                    List.of(),
                    reasons == null ? List.of() : List.copyOf(reasons),
                    Instant.now());
        }
    }
}
