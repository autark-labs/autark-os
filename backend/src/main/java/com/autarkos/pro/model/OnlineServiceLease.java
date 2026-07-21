package com.autarkos.pro.model;

import java.time.Instant;
import java.util.List;

public record OnlineServiceLease(
        String schemaVersion,
        String leaseId,
        String grantId,
        String deviceId,
        String devicePublicKeyFingerprint,
        List<String> features,
        List<String> services,
        String status,
        String issuer,
        Instant issuedAt,
        Instant renewAfter,
        Instant expiresAt,
        Instant serverTime,
        String keyId) {
}
