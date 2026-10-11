package com.autarkos.backups;

import java.time.Instant;
import java.util.List;

public final class RestoreModels {

    private RestoreModels() {
    }

    public record RestorePlan(
            long restorePointId,
            String scope,
            String source,
            String targetAppId,
            String title,
            String summary,
            List<String> affectedApps,
            List<String> warnings,
            List<String> steps,
            List<String> dryRunDetails,
            String verificationStatus,
            String verificationMessage,
            RestoreSimulationResult simulation,
            String restoreConfidence,
            boolean executable,
            Instant plannedAt,
            String planId,
            String jobId,
            List<RestorePlanApp> apps,
            List<String> blockedReasons) {
    }

    public record RestorePlanApp(String appId, String appName, String status, String message) {
    }

    public record RestoreRequest(String appId, String planId) {
    }

    public record RestoreResult(
            long restorePointId,
            String status,
            String message,
            List<String> restoredAppIds,
            List<String> failedAppIds,
            List<String> unattemptedAppIds,
            List<String> logs,
            Instant completedAt) {
    }

    public record RestoreSimulationResult(
            String status,
            String message,
            List<String> details,
            Instant simulatedAt) {
    }
}
