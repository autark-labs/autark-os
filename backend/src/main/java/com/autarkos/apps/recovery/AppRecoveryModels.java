package com.autarkos.apps.recovery;

import java.util.List;

public final class AppRecoveryModels {

    private AppRecoveryModels() {
    }

    public record RecoveryCandidate(
            String appId,
            String appName,
            String reason,
            String summary,
            String planHref) {
    }

    public record RecoveryCheck(
            String id,
            String label,
            String status,
            String message,
            String detail) {
    }

    public record RecoveryPlan(
            String appId,
            String appName,
            String reason,
            boolean applicable,
            String summary,
            String planId,
            boolean ownershipTransferRequired,
            String runtimePath,
            String sourceComposeProject,
            String targetComposeProject,
            String appInstanceId,
            List<String> containers,
            List<String> mounts,
            List<String> ports,
            List<RecoveryCheck> checks,
            List<String> steps,
            List<String> blockedReasons) {
    }

    public record RecoveryApplyRequest(
            String planId,
            boolean ownershipTransferConfirmed) {
    }
}
