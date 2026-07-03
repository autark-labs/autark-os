package com.autarkos.system.api;

import java.util.List;

public record SystemReadinessStatus(
        String status,
        String headline,
        String summary,
        boolean canCompleteOnboarding,
        boolean finishAnywayRequiresAdvanced,
        List<SystemReadinessGroup> groups) {
}
