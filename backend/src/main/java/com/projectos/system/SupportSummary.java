package com.projectos.system;

import java.time.Instant;
import java.util.List;

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
        List<SupportRedactionRule> redactionRules,
        List<SupportCommand> commands,
        Instant checkedAt) {
}
