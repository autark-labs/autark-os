package com.autarkos.security;

public record AdminSecuritySession(
        boolean authorized,
        String token,
        String message) {

    public static AdminSecuritySession denied(String message) {
        return new AdminSecuritySession(false, "", message);
    }
}
