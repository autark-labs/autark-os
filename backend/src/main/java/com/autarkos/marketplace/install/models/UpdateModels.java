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
                    "unavailable",
                    "Managed app updates are unavailable",
                    "The managed update service is not configured in this runtime. Restart Autark-OS and review Diagnostics if this continues.",
                    "managed_updates_not_configured",
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
            String planId,
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
            ChangeSafetyAdvice guardianAdvice,
            Instant checkedAt) {

        public static AppUpdatePlan blocked(String appId, String appName, String operation, String headline, String summary, List<String> reasons) {
            return new AppUpdatePlan(
                    appId,
                    appName,
                    operation,
                    "",
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
                    ChangeSafetyAdvice.unavailable(),
                    Instant.now());
        }

        public AppUpdatePlan reviewRequired() {
            return new AppUpdatePlan(
                    appId,
                    appName,
                    operation,
                    planId,
                    "review_required",
                    "Review the release plan again",
                    "The app or release plan changed after it was reviewed. Review the current plan before Autark-OS starts this change.",
                    currentVersion,
                    targetVersion,
                    false,
                    safetyBackupRequired,
                    rollbackAvailable,
                    rollbackSnapshotId,
                    changes,
                    List.of("Review the current release plan and confirm it again."),
                    guardianAdvice,
                    Instant.now());
        }

        public AppUpdatePlan withGuardianAdvice(ChangeSafetyAdvice advice) {
            ChangeSafetyAdvice safeAdvice = advice == null ? ChangeSafetyAdvice.unavailable() : advice;
            boolean guardianBlocksApply = "ready".equals(safeAdvice.state())
                    && List.of("defer", "blocked").contains(safeAdvice.outcome());
            return new AppUpdatePlan(
                    appId,
                    appName,
                    operation,
                    planId,
                    guardianBlocksApply ? safeAdvice.outcome() : status,
                    guardianBlocksApply ? safeAdvice.headline() : headline,
                    guardianBlocksApply ? safeAdvice.summary() : summary,
                    currentVersion,
                    targetVersion,
                    canApply && !guardianBlocksApply,
                    safetyBackupRequired,
                    rollbackAvailable,
                    rollbackSnapshotId,
                    changes,
                    guardianBlocksApply ? safeAdvice.reasons() : blockedReasons,
                    safeAdvice,
                    checkedAt);
        }
    }

    public record AppUpdateApplyRequest(String planId) {
    }

    public record ChangeSafetyAdvice(
            String state,
            String outcome,
            String headline,
            String summary,
            List<String> reasons,
            Instant analyzedAt,
            Instant expiresAt) {

        public static ChangeSafetyAdvice unavailable() {
            return new ChangeSafetyAdvice(
                    "unavailable",
                    "unavailable",
                    "Guardian guidance is unavailable",
                    "Autark-OS will continue with its standard verified backup, health check, and rollback protections.",
                    List.of(),
                    null,
                    null);
        }
    }
}
