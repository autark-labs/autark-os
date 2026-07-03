package com.autarkos.marketplace.install;

import java.time.Instant;

public record AppEvent(
        long id,
        String appId,
        String type,
        String message,
        Instant createdAt) {
}
