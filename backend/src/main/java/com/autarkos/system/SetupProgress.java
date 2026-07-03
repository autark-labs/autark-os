package com.autarkos.system;

import java.time.Instant;
import java.util.List;

public record SetupProgress(
        int setupVersion,
        List<String> completedSteps,
        List<String> skippedSteps,
        String lastRecommendedStep,
        boolean setupComplete,
        Instant updatedAt) {
}
