package com.autarkos.marketplace.install;

import java.time.Instant;

public record AppReliabilityIssue(
        String appId,
        String appName,
        String status,
        String message,
        String detail,
        String suggestedAction,
        boolean repairAvailable,
        Instant checkedAt) {
}
