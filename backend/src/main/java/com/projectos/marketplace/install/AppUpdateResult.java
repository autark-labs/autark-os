package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.List;

public record AppUpdateResult(
        String appId,
        String appName,
        String status,
        String message,
        List<String> logs,
        AppRuntimeView app,
        Instant completedAt) {
}
