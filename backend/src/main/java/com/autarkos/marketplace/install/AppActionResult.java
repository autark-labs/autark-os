package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;

import com.autarkos.apps.ApplicationState;

public record AppActionResult(
        String appId,
        String action,
        String status,
        String message,
        AppRuntimeView app,
        List<String> logs,
        Instant completedAt,
        boolean ok,
        String severity,
        String title,
        String nextAction,
        String jobId,
        ApplicationState applicationState) {

    public AppActionResult(
            String appId,
            String action,
            String status,
            String message,
            AppRuntimeView app,
            List<String> logs,
            Instant completedAt,
            boolean ok,
            String severity,
            String title,
            String nextAction,
            String jobId) {
        this(appId, action, status, message, app, logs, completedAt, ok, severity, title, nextAction, jobId, null);
    }

    public AppActionResult(
            String appId,
            String action,
            String status,
            String message,
            AppRuntimeView app,
            List<String> logs,
            Instant completedAt) {
        this(
                appId,
                action,
                status,
                message,
                app,
                logs,
                completedAt,
                okForStatus(status),
                severityForStatus(status),
                titleFor(action, status),
                nextActionFor(action),
                null,
                null);
    }

    public AppActionResult withApplicationState(ApplicationState state) {
        return new AppActionResult(appId, action, status, message, app, logs, completedAt, ok, severity, title, nextAction, jobId, state);
    }

    private static boolean okForStatus(String status) {
        return !"failed".equals(status) && !"error".equals(status);
    }

    private static String severityForStatus(String status) {
        if ("failed".equals(status) || "error".equals(status)) {
            return "error";
        }
        if ("needs_attention".equals(status)) {
            return "warning";
        }
        if ("skipped".equals(status) || "cancelled".equals(status) || "canceled".equals(status)) {
            return "info";
        }
        return "success";
    }

    private static String titleFor(String action, String status) {
        String label = switch (action == null ? "" : action) {
            case "start" -> "App started";
            case "stop" -> "App paused";
            case "restart" -> "App restarted";
            case "repair" -> "Repair finished";
            case "private-access" -> "Private access ready";
            case "private-access-disable" -> "Private access turned off";
            case "uninstall" -> "App removed";
            default -> "App action finished";
        };
        if ("needs_attention".equals(status) && "repair".equals(action)) {
            return "Repair needs attention";
        }
        return label;
    }

    private static String nextActionFor(String action) {
        return switch (action == null ? "" : action) {
            case "private-access", "private-access-disable" -> "refresh_access";
            case "uninstall" -> "open_apps";
            default -> "refresh_apps";
        };
    }
}
