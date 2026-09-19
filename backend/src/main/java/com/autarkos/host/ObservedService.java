package com.autarkos.host;

import java.time.Instant;

public record ObservedService(
        String id,
        String source,
        String fingerprint,
        String displayName,
        String url,
        String accessScope,
        String catalogAppId,
        String catalogMatchConfidence,
        String ownershipState,
        String runtimeState,
        String autarkOsInstanceId,
        Instant firstSeenAt,
        Instant lastSeenAt,
        String metadataJson) {

    public boolean catalogIdentityExplicit() {
        return java.util.Set.of("label", "user", "autark_os_failed_install").contains(catalogMatchConfidence);
    }
}
