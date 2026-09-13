package com.autarkos.api;

public final class ApplicationBehaviorStates {

    private ApplicationBehaviorStates() {
    }

    public static String managedManagementState() {
        return AutarkOsStates.ManagementState.MANAGED;
    }

    public static String managedReadinessState(String status) {
        return switch (normalize(status)) {
            case "ready" -> AutarkOsStates.ReadinessState.READY;
            case "starting" -> AutarkOsStates.ReadinessState.STARTING;
            case "paused", "stopped" -> AutarkOsStates.ReadinessState.PAUSED;
            case "needs attention", "unavailable", "missing" -> AutarkOsStates.ReadinessState.UNREACHABLE;
            default -> AutarkOsStates.ReadinessState.UNKNOWN;
        };
    }

    public static String managedAttentionState(String status) {
        return switch (normalize(status)) {
            case "missing" -> AutarkOsStates.AttentionState.BLOCKED;
            case "managed elsewhere" -> AutarkOsStates.AttentionState.CONFLICT;
            case "needs attention", "unavailable" -> AutarkOsStates.AttentionState.NEEDS_REVIEW;
            default -> AutarkOsStates.AttentionState.NONE;
        };
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(java.util.Locale.ROOT);
    }

}
