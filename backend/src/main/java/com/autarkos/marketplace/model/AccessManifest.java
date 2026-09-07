package com.autarkos.marketplace.model;

import java.util.List;

public record AccessManifest(
        String kind,
        String defaultMode,
        boolean privateAccessRecommended,
        boolean requiresFirstRunSetup,
        List<String> notes,
        boolean privateDashboard) {

    public AccessManifest(String kind, String defaultMode, boolean privateAccessRecommended,
            boolean requiresFirstRunSetup, List<String> notes) {
        this(kind, defaultMode, privateAccessRecommended, requiresFirstRunSetup, notes, false);
    }

    public static AccessManifest defaults() {
        return new AccessManifest("web", "local", false, false, List.of());
    }
}
