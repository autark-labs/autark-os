package com.projectos.backups;

import java.time.Instant;
import java.util.List;

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
        Instant plannedAt) {
}
