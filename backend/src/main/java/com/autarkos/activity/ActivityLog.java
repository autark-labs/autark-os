package com.autarkos.activity;

import java.time.Instant;

public record ActivityLog(
        long id,
        String level,
        String category,
        String action,
        String title,
        String message,
        String appId,
        String outcome,
        String details,
        Instant createdAt) {
}
