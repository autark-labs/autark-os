package com.autarkos.security;

import java.time.Instant;

public record AdminSecurityActionResult(
        boolean ok,
        String severity,
        String title,
        String message,
        Instant completedAt) {
}
