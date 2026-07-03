package com.autarkos.marketplace.model;

import java.util.List;

public record UsageManifest(
        String kind,
        String primaryAction,
        String openUrlLabel,
        String headline,
        String summary,
        boolean privateHttpsRequired,
        List<String> setupSteps,
        List<UsageField> fields,
        List<String> notes) {

    public static UsageManifest defaults() {
        return new UsageManifest(
                "web-app",
                "open-app",
                "Open app",
                "Ready to use",
                "Open the app in your browser after installation.",
                false,
                List.of("Open the app from Autark-OS."),
                List.of(),
                List.of());
    }
}
