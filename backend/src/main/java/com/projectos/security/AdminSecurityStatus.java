package com.projectos.security;

public record AdminSecurityStatus(
        boolean devMode,
        boolean claimed,
        boolean authRequired,
        String message,
        String setupCode) {
}
