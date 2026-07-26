package com.autarkos.extensions;

import java.time.Instant;

public record ExtensionRefreshResult(
        String schemaVersion,
        Instant completedAt,
        String stateCompatibility,
        int activeFindingCount,
        String highestSeverity,
        Recommendation recommendation) {

    public record Recommendation(
            String routeId,
            String actionId,
            String label) {
    }
}
