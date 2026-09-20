package com.autarkos.activity;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import com.autarkos.api.AutarkOsAction;
import com.autarkos.system.SupportDataRedactor;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ActivityLogService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ActivityLogService.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ActivityLogRepository repository;
    private final ApplicationEventPublisher events;

    public ActivityLog notification(ActivityController.NotificationRequest notification) {
        String key = "notification:" + notification.id();
        var redactor = new SupportDataRedactor();
        var action = notification.nextAction();
        var safeAction = action == null ? null : new AutarkOsAction(
                action.id(), redactor.redact(action.label()), action.method(), action.href(), action.route(),
                action.confirmationRequired(), action.danger(), action.disabled(), action.reason().map(redactor::redact));
        return activityLog(repository.findByEventKey(key).orElseGet(() -> repository.save(new ActivityLogEntity(
                notification.severity(), "notification", key,
                redactor.redact(notification.title()), redactor.redact(notification.message()), null,
                "error".equals(notification.severity()) ? "failed" : "recorded",
                safeAction == null ? "" : JSON.writeValueAsString(safeAction),
                Instant.now().toString(), key))));
    }

    public ActivityLogService(ActivityLogRepository repository) {
        this(repository, event -> {
        });
    }

    @Autowired
    public ActivityLogService(
            ActivityLogRepository repository,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.events = events;
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
        api(method, path, status, durationMs, null);
    }

    public void api(
            String method,
            String path,
            int status,
            long durationMs,
            String correlationId) {
        String level = status >= 500 ? "error" : status >= 400 ? "warning" : "info";
        String outcome = status >= 400 ? "failed" : "completed";
        String title = requestTitle(method, path);
        String message = status >= 400
                ? "Request finished with status " + status + "."
                : "Request completed.";
        String correlation = correlationId == null
                || !correlationId.matches(
                        "^[A-Za-z0-9._-]{1,128}$")
                                ? ""
                                : ";correlationId=" + correlationId;
        record(
                level,
                "api",
                method + " " + path,
                title,
                message,
                null,
                outcome,
                "status=" + status
                        + ";durationMs=" + durationMs
                        + correlation);
    }

    public List<ActivityLog> recent(int limit) {
        return repository.recent(safeLimit(limit)).stream()
                .map(this::activityLog)
                .toList();
    }

    public List<ActivityLog> recent(int limit, String level, String category, String outcome, String appId) {
        return repository.recentFiltered(
                        safeLimit(limit),
                        cleanFilter(level),
                        cleanFilter(category),
                        cleanFilter(outcome),
                        cleanFilter(appId))
                .stream()
                .map(this::activityLog)
                .toList();
    }

    @Transactional
    private void record(String level, String category, String action, String title, String message, String appId, String outcome, String details) {
        try {
            repository.save(new ActivityLogEntity(
                    clean(level, "info"),
                    clean(category, "system"),
                    clean(action, "activity"),
                    clean(title, "Autark-OS activity"),
                    clean(message, ""),
                    cleanFilter(appId),
                    clean(outcome, "recorded"),
                    clean(details, ""),
                    Instant.now().toString()));
            logToConsole(level, category, action, title, message, appId, outcome);
            if (meaningfulMutation(level, category, action, outcome)) {
                try {
                    events.publishEvent(new SuccessfulMutationEvent(
                            clean(category, "system"),
                            clean(action, "activity")));
                } catch (RuntimeException exception) {
                    LOGGER.debug(
                            "Unable to enqueue extension refresh.",
                            exception);
                }
            }
        } catch (RuntimeException exception) {
            LOGGER.warn("Unable to write Autark-OS activity log: {}", exception.getMessage());
        }
    }

    private boolean meaningfulMutation(
            String level,
            String category,
            String action,
            String outcome) {
        if (!"completed".equals(outcome)
                || List.of("api", "pro", "extension")
                        .contains(clean(category, "system"))) {
            return false;
        }
        if ("success".equals(level)) {
            return true;
        }
        String candidate = clean(action, "activity");
        return "settings".equals(category)
                && (candidate.endsWith("_updated")
                        || candidate.endsWith("_applied"));
    }

    private ActivityLog activityLog(ActivityLogEntity entity) {
        return new ActivityLog(
                entity.id() == null ? 0 : entity.id(),
                entity.level(),
                entity.category(),
                entity.action(),
                entity.title(),
                entity.message(),
                entity.appId(),
                entity.outcome(),
                entity.details(),
                Instant.parse(entity.createdAt()),
                "notification".equals(entity.category()) && !entity.details().isBlank()
                        ? JSON.readValue(entity.details(), AutarkOsAction.class) : null);
    }

    private int safeLimit(int limit) {
        return Math.max(1, Math.min(limit, 200));
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
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
