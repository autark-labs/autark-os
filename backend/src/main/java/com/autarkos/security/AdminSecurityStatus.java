package com.autarkos.security;

public record AdminSecurityStatus(
        boolean devMode,
        boolean claimed,
        boolean authRequired,
        String message,
        String setupCodeCommand,
        String passwordResetCommand) {
}
