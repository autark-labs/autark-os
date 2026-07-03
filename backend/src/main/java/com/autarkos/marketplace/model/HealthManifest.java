package com.autarkos.marketplace.model;

public record HealthManifest(
        String type,
        String path,
        int startupGraceSeconds,
        String successLabel,
        String startingLabel,
        String failureLabel,
        String description) {

    private static final int DEFAULT_STARTUP_GRACE_SECONDS = 180;

    public static HealthManifest defaults(AccessManifest access, UsageManifest usage) {
        String usageKind = usage == null ? "" : usage.kind();
        String accessKind = access == null ? "" : access.kind();
        boolean nonWebService = "background".equals(accessKind)
                || "background-service".equals(usageKind)
                || "infrastructure".equals(usageKind);
        boolean companionService = "companion-service".equals(usageKind);

        if (nonWebService) {
            return new HealthManifest(
                    "container",
                    "",
                    DEFAULT_STARTUP_GRACE_SECONDS,
                    "Running in the background",
                    "Starting service",
                    "Service needs attention",
                    "Autark-OS checks that the managed container is running.");
        }
        if (companionService) {
            return new HealthManifest(
                    "container",
                    "",
                    DEFAULT_STARTUP_GRACE_SECONDS,
                    "Ready to connect",
                    "Starting sync service",
                    "Sync service needs attention",
                    "Autark-OS checks that the service is running and then shows the connection details.");
        }
        return new HealthManifest(
                "http",
                "/",
                DEFAULT_STARTUP_GRACE_SECONDS,
                "Ready to open",
                "Starting up",
                "App link is not responding",
                "Autark-OS checks that the app is running and that its local link answers.");
    }
}
