package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;

public final class ReliabilityModels {

    private ReliabilityModels() {
    }

    public record AppReliabilityActivity(
            long id,
            String appId,
            String appName,
            String type,
            String message,
            String tone,
            Instant createdAt) {
    }

    public record AppReliabilityIssue(
            String appId,
            String appName,
            String status,
            String message,
            String detail,
            String suggestedAction,
            boolean repairAvailable,
            Instant checkedAt) {
    }

    public record AppReliabilitySummary(
            String posture,
            String headline,
            String summary,
            int totalApps,
            int readyApps,
            int startingApps,
            int pausedApps,
            int needsAttentionApps,
            int unavailableApps,
            int privateApps,
            int autoRepairEnabledApps,
            int recentSuccessfulRepairs,
            int recentFailedRepairs,
            List<AppReliabilityIssue> issues,
            List<AppReliabilityActivity> recentActivity,
            Instant checkedAt) {
    }

    public record AppRemediationView(
            String state,
            String label,
            String summary,
            String nextActionLabel,
            String tone) {
    }
}
