package com.projectos.api;

import com.projectos.host.ObservedServiceStatus;

public final class ApplicationBehaviorStates {

    private ApplicationBehaviorStates() {
    }

    public static String managedManagementState() {
        return "managed";
    }

    public static String observedManagementState(String userStatus, boolean pinned, boolean managedByThisProjectOs) {
        if (managedByThisProjectOs || ObservedServiceStatus.MANAGED.equals(userStatus)) {
            return "managed";
        }
        if (pinned || ObservedServiceStatus.PINNED.equals(userStatus)) {
            return "linked";
        }
        return "found";
    }

    public static String managedReadinessState(String status) {
        return switch (normalize(status)) {
            case "ready" -> "ready";
            case "starting" -> "starting";
            case "paused", "stopped" -> "paused";
            case "needs attention", "unavailable", "missing" -> "unreachable";
            default -> "unknown";
        };
    }

    public static String observedReadinessState(String runtimeState, String url, boolean pinned) {
        String normalized = normalize(runtimeState);
        if (normalized.contains("start")) {
            return "starting";
        }
        if (normalized.contains("pause") || normalized.contains("stop") || normalized.contains("exit")) {
            return "paused";
        }
        if (normalized.contains("unhealthy") || normalized.contains("unreachable") || normalized.contains("fail")) {
            return "unreachable";
        }
        if (normalized.contains("running") || hasText(url) || pinned) {
            return "ready";
        }
        return "unknown";
    }

    public static String managedAttentionState(String status) {
        return switch (normalize(status)) {
            case "missing" -> "blocked";
            case "managed elsewhere" -> "conflict";
            case "needs attention", "unavailable" -> "needs_review";
            default -> "none";
        };
    }

    public static String observedAttentionState(String userStatus) {
        return switch (userStatus) {
            case ObservedServiceStatus.CONFLICT -> "blocked";
            case ObservedServiceStatus.OWNED_ELSEWHERE -> "conflict";
            case ObservedServiceStatus.RECOVERABLE, ObservedServiceStatus.FOUND, ObservedServiceStatus.FAILED_INSTALL -> "needs_review";
            default -> "none";
        };
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
