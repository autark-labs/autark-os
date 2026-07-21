package com.autarkos.pro.model;

import java.time.Instant;
import java.util.List;

public record ProReleaseManifest(
        String schemaVersion,
        long sequence,
        Instant createdAt,
        Instant expiresAt,
        String releaseChannel,
        String component,
        String version,
        String repository,
        String digest,
        String architecture,
        Instant publishedAt,
        String minimumCoreVersion,
        String maximumCoreVersion,
        String agentApiRange,
        String rolloutGroup,
        List<String> features,
        String signingKeyId) {
}
