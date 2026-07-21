package com.autarkos.pro.model;

import java.time.Instant;
import java.util.List;

public record ProEntitlementStatus(
        String schemaVersion,
        ProEntitlementState state,
        String plan,
        List<String> features,
        Instant updatesThrough,
        Instant serviceLeaseExpiresAt,
        Instant lastVerifiedServerTime,
        boolean localUseAllowed,
        boolean updatesAllowed,
        boolean hostedServicesAllowed,
        String grantFingerprint,
        String reasonCode) {
}
