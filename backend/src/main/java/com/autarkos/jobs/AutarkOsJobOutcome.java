package com.autarkos.jobs;

import java.util.List;

public record AutarkOsJobOutcome(
        String status,
        String message,
        List<AutarkOsJobStep> steps) {

    public static AutarkOsJobOutcome succeeded(String message) {
        return succeeded(message, List.of());
    }

    public static AutarkOsJobOutcome succeeded(String message, List<AutarkOsJobStep> steps) {
        return new AutarkOsJobOutcome("succeeded", message, steps == null ? List.of() : steps);
    }

    public static AutarkOsJobOutcome failed(String message, List<AutarkOsJobStep> steps) {
        return new AutarkOsJobOutcome("failed", message, steps == null ? List.of() : steps);
    }
}
