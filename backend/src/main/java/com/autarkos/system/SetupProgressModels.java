package com.autarkos.system;

import java.time.Instant;
import java.util.List;

public final class SetupProgressModels {

    private SetupProgressModels() {
    }

    public record SetupProgress(
            int setupVersion,
            List<String> completedSteps,
            List<String> skippedSteps,
            String lastRecommendedStep,
            boolean setupComplete,
            Instant updatedAt) {
    }

    public record SetupProgressSummary(
            boolean complete,
            String status,
            String nextStep,
            String summary) {
    }

    public record SetupProgressUpdateRequest(String step) {
    }

    public record SetupStatus(
            boolean setupComplete,
            String currentStep,
            String message) {
    }
}
