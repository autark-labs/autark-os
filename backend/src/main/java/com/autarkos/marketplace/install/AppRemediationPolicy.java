package com.autarkos.marketplace.install;

import com.autarkos.api.AutarkOsStates;

public final class AppRemediationPolicy {

    private AppRemediationPolicy() {
    }

    public static ReliabilityModels.AppRemediationView remediation(
            String appName,
            String status,
            String lastRepairStatus,
            boolean autoRepairEnabled,
            boolean hasRestorePoint,
            boolean repairAvailable) {
        String name = clean(appName, "This app");
        String normalizedRepairStatus = normalize(lastRepairStatus);

        if (repairRunning(normalizedRepairStatus)) {
            return new ReliabilityModels.AppRemediationView(
                    "auto_repairing",
                    "Autark-OS is repairing",
                    name + " is not ready yet. Autark-OS is trying a safe repair before asking you to intervene.",
                    "Wait for repair",
                    "warning");
        }

        if (repairFailed(normalizedRepairStatus) && hasRestorePoint) {
            return new ReliabilityModels.AppRemediationView(
                    "restore_recommended",
                    "Restore recommended",
                    "Safe repair did not finish. A completed restore point is available, so review restore before trying riskier fixes.",
                    "Review restore",
                    "critical");
        }

        if (repairFailed(normalizedRepairStatus)) {
            return new ReliabilityModels.AppRemediationView(
                    "repair_failed",
                    "Repair needs review",
                    "Autark-OS tried a safe repair, but " + name + " still needs attention. Review the repair details before taking a riskier action.",
                    "Review repair",
                    "critical");
        }

        if (repairSucceeded(normalizedRepairStatus) && healthy(status)) {
            return new ReliabilityModels.AppRemediationView(
                    "repair_succeeded",
                    "Repair succeeded",
                    "Autark-OS recently repaired " + name + ". It is ready now.",
                    "No action needed",
                    "success");
        }

        if (needsUserAction(status)) {
            if (autoRepairEnabled && repairAvailable) {
                return new ReliabilityModels.AppRemediationView(
                        "needs_user_action",
                        "Repair available",
                        name + " needs attention. Autark-OS can try a safe repair from Manage.",
                        "Open Manage",
                        "warning");
            }
            return new ReliabilityModels.AppRemediationView(
                    "needs_user_action",
                    "Needs your review",
                    name + " needs your review before Autark-OS can safely recover it.",
                    "Open Manage",
                    "critical");
        }

        if (autoRepairEnabled && healthy(status)) {
            return new ReliabilityModels.AppRemediationView(
                    "watching",
                    "Autark-OS is watching",
                    name + " is ready. If it drifts, Autark-OS will try safe repair before asking you to intervene.",
                    "No action needed",
                    "success");
        }

        return new ReliabilityModels.AppRemediationView(
                "healthy",
                "Ready",
                name + " is ready to use.",
                "No action needed",
                "success");
    }

    private static boolean healthy(String status) {
        return AutarkOsStates.AppStatus.READY.equals(status) || "Running".equals(status);
    }

    private static boolean needsUserAction(String status) {
        return AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(status) || AutarkOsStates.AppStatus.UNAVAILABLE.equals(status) || AutarkOsStates.AppStatus.MISSING.equals(status);
    }

    private static boolean repairRunning(String normalizedRepairStatus) {
        return normalizedRepairStatus.contains("running")
                || normalizedRepairStatus.contains("started")
                || normalizedRepairStatus.contains("queued");
    }

    private static boolean repairFailed(String normalizedRepairStatus) {
        return normalizedRepairStatus.contains("failed")
                || normalizedRepairStatus.contains("error")
                || normalizedRepairStatus.contains("blocked")
                || normalizedRepairStatus.contains("needs_attention");
    }

    private static boolean repairSucceeded(String normalizedRepairStatus) {
        return normalizedRepairStatus.contains("completed")
                || normalizedRepairStatus.contains("succeeded");
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private static String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
