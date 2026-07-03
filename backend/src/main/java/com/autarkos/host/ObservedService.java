package com.autarkos.host;

import java.time.Instant;

public record ObservedService(
        String id,
        String source,
        String fingerprint,
        String displayName,
        String url,
        String category,
        String accessScope,
        String catalogAppId,
        String catalogMatchConfidence,
        String ownershipState,
        String userVisibility,
        String runtimeState,
        boolean healthCheckEnabled,
        String autarkOsInstanceId,
        Instant firstSeenAt,
        Instant lastSeenAt,
        Instant pinnedAt,
        Instant ignoredAt,
        String metadataJson) {
}
