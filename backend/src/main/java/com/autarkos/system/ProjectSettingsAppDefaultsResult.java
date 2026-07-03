package com.autarkos.system;

import java.time.Instant;

public record ProjectSettingsAppDefaultsResult(
        boolean ok,
        String severity,
        String title,
        String message,
        int updatedApps,
        Instant completedAt) {
}
