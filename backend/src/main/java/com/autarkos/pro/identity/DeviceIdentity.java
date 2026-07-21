package com.autarkos.pro.identity;

import java.time.Instant;

public record DeviceIdentity(
        String schemaVersion,
        String deviceId,
        String installationId,
        String algorithm,
        String keyId,
        DevicePublicKey publicKey,
        String publicKeyFingerprint,
        Instant createdAt,
        Instant updatedAt) {
}
