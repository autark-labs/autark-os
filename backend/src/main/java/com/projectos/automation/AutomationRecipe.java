package com.projectos.automation;

import java.time.Instant;

public record AutomationRecipe(
        String id,
        String title,
        String summary,
        String trigger,
        String action,
        String safetyLimit,
        String status,
        boolean enabled,
        boolean configurable,
        String lastRun,
        String lastResult,
        Instant updatedAt) {
}
