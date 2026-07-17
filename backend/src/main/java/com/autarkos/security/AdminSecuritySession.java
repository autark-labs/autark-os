package com.autarkos.security;

public record AdminSecuritySession(
        boolean authorized,
        String token,
        String message,
        String expiresAt,
        long retryAfterSeconds) {

    public static AdminSecuritySession denied(String message) {
        return new AdminSecuritySession(false, "", message, "", 0);
    }

    public static AdminSecuritySession rateLimited(String message, long retryAfterSeconds) {
        return new AdminSecuritySession(false, "", message, "", Math.max(1, retryAfterSeconds));
    }

    public AdminSecuritySession withoutToken() {
        return new AdminSecuritySession(authorized, "", message, expiresAt, retryAfterSeconds);
    }
}
