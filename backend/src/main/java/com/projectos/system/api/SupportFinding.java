package com.projectos.system.api;

public record SupportFinding(
        String id,
        String area,
        String severity,
        String title,
        String message,
        String actionLabel,
        String route) {
}
