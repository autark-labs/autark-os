package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.List;

public record AppActionResult(
        String appId,
        String action,
        String status,
        String message,
        AppRuntimeView app,
        List<String> logs,
        Instant completedAt) {
}
