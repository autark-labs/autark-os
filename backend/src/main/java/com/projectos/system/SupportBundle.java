package com.projectos.system;

import java.time.Instant;
import java.util.List;

import com.projectos.activity.ActivityLog;

public record SupportBundle(
        String status,
        String headline,
        String summary,
        boolean redacted,
        String backendHealth,
        String dockerStatus,
        String tailscaleStatus,
        String serviceStatus,
        ProjectVersionInfo version,
        SystemSetupStatus setup,
        SystemMetrics metrics,
        List<SupportDomainSummary> domainSummaries,
        List<ActivityLog> recentActivity,
        List<ActivityLog> recentFailures,
        List<SupportLogLine> logs,
        List<SupportFinding> findings,
        List<SupportRedactionRule> redactionRules,
        List<SupportCommand> commands,
        String bundleText,
        int recentFailureCount,
        Instant generatedAt) {
}
