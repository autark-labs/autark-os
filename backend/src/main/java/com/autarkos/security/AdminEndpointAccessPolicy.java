package com.autarkos.security;

import org.springframework.stereotype.Component;

@Component
public class AdminEndpointAccessPolicy {

    public AccessMode accessMode(String method, String path) {
        if (path == null || !path.startsWith("/api/")) {
            return AccessMode.NOT_API;
        }
        if (isRead(method) && ("/api/health".equals(path)
                || "/api/admin/security/status".equals(path)
                || "/api/system/version".equals(path))) {
            return AccessMode.PUBLIC;
        }
        if ("POST".equalsIgnoreCase(method)
                && ("/api/admin/security/claim".equals(path) || "/api/admin/security/login".equals(path))) {
            return AccessMode.PUBLIC;
        }
        if ("POST".equalsIgnoreCase(method) && "/api/admin/security/local/reset-password".equals(path)) {
            return AccessMode.LOCAL_ADMIN;
        }
        return AccessMode.AUTHENTICATED;
    }

    private boolean isRead(String method) {
        return "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method);
    }

    public enum AccessMode {
        NOT_API,
        PUBLIC,
        LOCAL_ADMIN,
        AUTHENTICATED
    }
}
