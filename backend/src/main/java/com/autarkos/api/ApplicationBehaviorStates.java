package com.autarkos.api;

import com.autarkos.host.ObservedServiceStatus;

public final class ApplicationBehaviorStates {

    private ApplicationBehaviorStates() {
    }

    public static String managedManagementState() {
        return AutarkOsStates.ManagementState.MANAGED;
    }

    public static String observedManagementState(String userStatus, boolean pinned, boolean managedByThisAutarkOs) {
        if (managedByThisAutarkOs || ObservedServiceStatus.MANAGED.equals(userStatus)) {
            return AutarkOsStates.ManagementState.MANAGED;
        }
        if (pinned || ObservedServiceStatus.PINNED.equals(userStatus)) {
            return AutarkOsStates.ManagementState.LINKED;
        }
        return AutarkOsStates.ManagementState.FOUND;
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

    public static String observedReadinessState(String runtimeState, String url, boolean pinned) {
        String normalized = normalize(runtimeState);
        if (normalized.contains("start")) {
            return AutarkOsStates.ReadinessState.STARTING;
        }
        if (normalized.contains("pause") || normalized.contains("stop") || normalized.contains("exit")) {
            return AutarkOsStates.ReadinessState.PAUSED;
        }
        if (normalized.contains("unhealthy") || normalized.contains("unreachable") || normalized.contains("fail")) {
            return AutarkOsStates.ReadinessState.UNREACHABLE;
        }
        if (normalized.contains("running") || hasText(url) || pinned) {
            return AutarkOsStates.ReadinessState.READY;
        }
        return AutarkOsStates.ReadinessState.UNKNOWN;
    }

    public static String managedAttentionState(String status) {
        return switch (normalize(status)) {
            case "missing" -> AutarkOsStates.AttentionState.BLOCKED;
            case "managed elsewhere" -> AutarkOsStates.AttentionState.CONFLICT;
            case "needs attention", "unavailable" -> AutarkOsStates.AttentionState.NEEDS_REVIEW;
            default -> AutarkOsStates.AttentionState.NONE;
        };
    }

    public static String observedAttentionState(String userStatus) {
        return switch (userStatus) {
            case ObservedServiceStatus.CONFLICT -> AutarkOsStates.AttentionState.BLOCKED;
            case ObservedServiceStatus.OWNED_ELSEWHERE -> AutarkOsStates.AttentionState.CONFLICT;
            case ObservedServiceStatus.RECOVERABLE, ObservedServiceStatus.FOUND, ObservedServiceStatus.FAILED_INSTALL -> AutarkOsStates.AttentionState.NEEDS_REVIEW;
            default -> AutarkOsStates.AttentionState.NONE;
        };
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
