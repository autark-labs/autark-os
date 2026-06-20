package com.projectos.system;

public record SupportFinding(
        String id,
        String area,
        String severity,
        String title,
        String message,
        String actionLabel,
        String route) {
}
