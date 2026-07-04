package com.autarkos.system;

import java.time.Instant;
import java.util.List;

import com.autarkos.activity.ActivityLog;
import com.autarkos.api.AutarkOsIssue;
import com.autarkos.system.SystemSetupModels.SystemSetupStatus;

public final class SupportModels {

    private SupportModels() {
    }

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

    public record SupportCommand(
            String id,
            String label,
            String description,
            String command,
            String destination) {
    }

    public record SupportDomainSummary(
            String id,
            String label,
            String status,
            String headline,
            String summary) {
    }

    public record SupportFinding(
            String id,
            String area,
            String severity,
            String title,
            String message,
            String actionLabel,
            String route) {
    }

    public record SupportLogLine(
            String line,
            String level,
            boolean redacted) {
    }

    public record SupportRedactionRule(
            String id,
            String label,
            String description) {
    }

    public record SupportSummary(
            String status,
            String headline,
            String summary,
            boolean redacted,
            String backendHealth,
            String dockerStatus,
            String tailscaleStatus,
            String serviceStatus,
            ProjectVersionInfo version,
            int recentFailures,
            List<SupportFinding> findings,
            List<AutarkOsIssue> unifiedIssues,
            List<SupportRedactionRule> redactionRules,
            List<SupportCommand> commands,
            Instant checkedAt) {
    }
}
