package com.autarkos.system;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Keeps first-boot routing and the setup recommendation model on one durable completion flag. */
final class SetupCompletionState {

    static final String ONBOARDING_STATUS_KEY = "onboardingStatus";
    static final String PROGRESS_COMPLETED_KEY = "setupProgressCompletedSteps";
    static final String PROGRESS_UPDATED_KEY = "setupProgressUpdatedAt";

    private SetupCompletionState() {
    }

    static boolean isComplete(Map<String, String> values) {
        String canonicalStatus = values.get(ONBOARDING_STATUS_KEY);
        if (canonicalStatus != null && !canonicalStatus.isBlank()) {
            return "complete".equalsIgnoreCase(canonicalStatus.trim());
        }
        // Migrate releases that only persisted the older setup-progress model.
        return steps(values.get(PROGRESS_COMPLETED_KEY)).contains("done");
    }

    static String onboardingStatus(Map<String, String> values) {
        String status = values.get(ONBOARDING_STATUS_KEY);
        if (status != null && !status.isBlank()) {
            return switch (status.trim().toLowerCase()) {
                case "complete" -> "complete";
                case "in_progress" -> "in_progress";
                default -> "not_started";
            };
        }
        return steps(values.get(PROGRESS_COMPLETED_KEY)).contains("done") ? "complete" : "not_started";
    }

    static Set<String> steps(String value) {
        if (value == null || value.isBlank()) {
            return new LinkedHashSet<>();
        }
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(step -> !step.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    static String encode(Set<String> steps) {
        return String.join(",", steps);
    }
}
