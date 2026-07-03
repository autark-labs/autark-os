package com.autarkos.activity;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ActivityLogService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ActivityLogService.class);

    private final ActivityLogRepository repository;

    public ActivityLogService(ActivityLogRepository repository) {
        this.repository = repository;
    }

    public void info(String category, String action, String title, String message) {
        record("info", category, action, title, message, null, "completed", "");
    }

    public void info(String category, String action, String title, String message, String appId) {
        record("info", category, action, title, message, appId, "completed", "");
    }

    public void success(String category, String action, String title, String message, String appId) {
        record("success", category, action, title, message, appId, "completed", "");
    }

    public void warning(String category, String action, String title, String message, String appId) {
        record("warning", category, action, title, message, appId, "needs_attention", "");
    }

    public void error(String category, String action, String title, String message, String appId, Throwable exception) {
        record("error", category, action, title, message, appId, "failed", exception == null ? "" : exceptionSummary(exception));
    }

    public void api(String method, String path, int status, long durationMs) {
        String level = status >= 500 ? "error" : status >= 400 ? "warning" : "info";
        String outcome = status >= 400 ? "failed" : "completed";
        String title = requestTitle(method, path);
        String message = status >= 400
                ? "Request finished with status " + status + "."
                : "Request completed.";
        record(level, "api", method + " " + path, title, message, null, outcome, "status=" + status + ";durationMs=" + durationMs);
    }

    public List<ActivityLog> recent(int limit) {
        return repository.recent(limit);
    }

    public List<ActivityLog> recent(int limit, String level, String category, String outcome, String appId) {
        return repository.recent(limit, cleanFilter(level), cleanFilter(category), cleanFilter(outcome), cleanFilter(appId));
    }

    private void record(String level, String category, String action, String title, String message, String appId, String outcome, String details) {
        try {
            repository.record(level, category, action, title, message, appId, outcome, details);
            logToConsole(level, category, action, title, message, appId, outcome);
        } catch (RuntimeException exception) {
            LOGGER.warn("Unable to write Autark-OS activity log: {}", exception.getMessage());
        }
    }

    private void logToConsole(String level, String category, String action, String title, String message, String appId, String outcome) {
        String app = appId == null || appId.isBlank() ? "" : " appId=" + appId;
        String formatted = "[{}] {} action={} outcome={}{} - {}";
        switch (level) {
            case "error" -> LOGGER.error(formatted, category, title, action, outcome, app, message);
            case "warning" -> LOGGER.warn(formatted, category, title, action, outcome, app, message);
            case "success" -> LOGGER.info(formatted, category, title, action, outcome, app, message);
            default -> LOGGER.info(formatted, category, title, action, outcome, app, message);
        }
    }

    private String exceptionSummary(Throwable exception) {
        Map<String, String> values = Map.of(
                "type", exception.getClass().getSimpleName(),
                "message", exception.getMessage() == null ? "" : exception.getMessage());
        return values.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + sanitize(entry.getValue()))
                .collect(Collectors.joining(";"));
    }

    private String sanitize(String value) {
        return value.replace(";", ",").replace("\n", " ").trim();
    }

    private String cleanFilter(String value) {
        return value == null || value.isBlank() || "all".equalsIgnoreCase(value.trim()) ? null : value.trim();
    }

    private String requestTitle(String method, String path) {
        if (path.startsWith("/api/marketplace")) {
            return method + " Marketplace";
        }
        if (path.startsWith("/api/apps")) {
            return method + " Applications";
        }
        if (path.startsWith("/api/network")) {
            return method + " Network";
        }
        if (path.startsWith("/api/system")) {
            return method + " System setup";
        }
        return method + " API";
    }
}
