package com.autarkos.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

final class AdminSessionTokenResolver {

    static final String COOKIE_NAME = "autark-os-admin-session";

    private AdminSessionTokenResolver() {
    }

    static String resolve(HttpServletRequest request) {
        String bearer = bearerToken(request.getHeader("Authorization"));
        if (!bearer.isBlank()) {
            return bearer;
        }
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return "";
        }
        for (Cookie cookie : cookies) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue() == null ? "" : cookie.getValue().trim();
            }
        }
        return "";
    }

    private static String bearerToken(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, "Bearer ".length())) {
            return "";
        }
        return authorization.substring("Bearer ".length()).trim();
    }
}
