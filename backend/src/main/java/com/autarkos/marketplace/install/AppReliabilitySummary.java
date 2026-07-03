package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;

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
