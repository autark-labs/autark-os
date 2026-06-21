package com.projectos.host;

public record ActionResult(
        boolean ok,
        String severity,
        String title,
        String message,
        String resourceId,
        String nextAction) {
}
