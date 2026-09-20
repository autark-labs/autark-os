package com.autarkos.activity;

import java.time.Instant;
import com.autarkos.api.AutarkOsAction;

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
        Instant createdAt,
        AutarkOsAction nextAction) {
}
