package com.autarkos.pro.model;

import java.time.Instant;

public record DeviceRegistrationChallenge(
        String schemaVersion,
        String nonce,
        String deviceId,
        String installationId,
        String publicKeyFingerprint,
        String architecture,
        String coreVersion,
        Instant issuedAt,
        Instant expiresAt) {
}
