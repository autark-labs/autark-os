package com.projectos.activity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class ApiActivityInterceptor implements HandlerInterceptor {

    private static final String START_TIME = ApiActivityInterceptor.class.getName() + ".startTime";

    private final ActivityLogService activityLogService;

    public ApiActivityInterceptor(ActivityLogService activityLogService) {
        this.activityLogService = activityLogService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute(START_TIME, System.currentTimeMillis());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
        if (!shouldRecord(request, response)) {
            return;
        }
        Object start = request.getAttribute(START_TIME);
        long durationMs = start instanceof Long startedAt ? System.currentTimeMillis() - startedAt : 0;
        activityLogService.api(request.getMethod(), request.getRequestURI(), response.getStatus(), durationMs);
        if (exception != null) {
            activityLogService.error("api", request.getMethod() + " " + request.getRequestURI(), "API request failed", exception.getMessage(), null, exception);
        }
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
        return path.equals("/api/apps/reliability")
                || path.equals("/api/network/diagnostics")
                || path.equals("/api/network/private-access/reconciliation")
                || path.equals("/api/system/setup-status");
    }
}
