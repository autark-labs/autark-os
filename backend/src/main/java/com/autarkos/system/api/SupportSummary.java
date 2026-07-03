package com.autarkos.system.api;

import java.time.Instant;
import java.util.List;

import com.autarkos.api.AutarkOsIssue;
import com.autarkos.system.ProjectVersionInfo;

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
