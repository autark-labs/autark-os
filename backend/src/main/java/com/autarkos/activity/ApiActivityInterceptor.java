package com.autarkos.activity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class ApiActivityInterceptor implements HandlerInterceptor {

    private static final String START_TIME = ApiActivityInterceptor.class.getName() + ".startTime";

    private final ActivityLogService activityLogService;
    private final ApplicationEventPublisher events;

    public ApiActivityInterceptor(
            ActivityLogService activityLogService,
            ApplicationEventPublisher events) {
        this.activityLogService = activityLogService;
        this.events = events;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute(START_TIME, System.currentTimeMillis());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
        ApiMutationCompletedEvent mutation = null;
        if (successfulMutation(request, response, exception)) {
            mutation = new ApiMutationCompletedEvent(
                    request.getMethod().toUpperCase(),
                    request.getRequestURI(),
                    response.getStatus());
            events.publishEvent(mutation);
        }
        if (!shouldRecord(request, response)) {
            return;
        }
        Object start = request.getAttribute(START_TIME);
        long durationMs = start instanceof Long startedAt ? System.currentTimeMillis() - startedAt : 0;
        activityLogService.api(
                request.getMethod(),
                request.getRequestURI(),
                response.getStatus(),
                durationMs,
                mutation == null ? null : mutation.correlationId());
        if (exception != null) {
            activityLogService.error("api", request.getMethod() + " " + request.getRequestURI(), "API request failed", exception.getMessage(), null, exception);
        }
    }

    private boolean successfulMutation(
            HttpServletRequest request,
            HttpServletResponse response,
            Exception exception) {
        boolean mutationMethod = switch (
                request.getMethod().toUpperCase()) {
            case "POST", "PUT", "PATCH", "DELETE" -> true;
            default -> false;
        };
        return exception == null
                && request.getRequestURI().startsWith("/api/")
                && mutationMethod
                && response.getStatus() >= 200
                && response.getStatus() < 400;
    }

    private boolean shouldRecord(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getRequestURI();
        if (!path.startsWith("/api/")) {
            return false;
        }
        if (path.equals("/api/health") || path.equals("/api/activity")) {
            return false;
        }
        if (response.getStatus() >= 400) {
            return true;
        }
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        // Successful reads are normal UI polling, not user-visible activity. Keeping
        // them in SQLite turns an idle dashboard into an unbounded event producer.
        return false;
    }
}
