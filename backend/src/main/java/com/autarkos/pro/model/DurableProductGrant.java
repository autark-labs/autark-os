package com.autarkos.pro.model;

import java.time.Instant;
import java.util.List;

public record DurableProductGrant(
        String schemaVersion,
        String grantId,
        String deviceId,
        String installationId,
        String devicePublicKeyFingerprint,
        String plan,
        List<String> features,
        String releaseChannel,
        String issuer,
        Instant issuedAt,
        Instant updatesThrough,
        String localUse,
        String keyId) {
}
