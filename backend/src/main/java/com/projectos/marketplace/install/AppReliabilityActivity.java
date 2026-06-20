package com.projectos.marketplace.install;

import java.time.Instant;

public record AppReliabilityActivity(
        long id,
        String appId,
        String appName,
        String type,
        String message,
        String tone,
        Instant createdAt) {
}
