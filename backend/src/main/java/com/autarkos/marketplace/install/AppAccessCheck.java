package com.autarkos.marketplace.install;

import java.time.Instant;

public record AppAccessCheck(
        String appId,
        String url,
        String status,
        String message,
        Instant checkedAt) {

    public static AppAccessCheck notConfigured(String appId) {
        return new AppAccessCheck(appId, null, "not_configured", "No app link has been configured yet.", Instant.now());
    }

    public static AppAccessCheck reachable(String appId, String url) {
        return new AppAccessCheck(appId, url, "reachable", "App link is responding.", Instant.now());
    }

    public static AppAccessCheck unreachable(String appId, String url) {
        return new AppAccessCheck(appId, url, "unreachable", "App is running, but the link is not responding.", Instant.now());
    }
}
