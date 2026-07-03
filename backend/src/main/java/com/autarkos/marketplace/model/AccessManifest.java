package com.autarkos.marketplace.model;

import java.util.List;

public record AccessManifest(
        String kind,
        String defaultMode,
        boolean privateAccessRecommended,
        boolean requiresFirstRunSetup,
        List<String> notes) {

    public static AccessManifest defaults() {
        return new AccessManifest("web", "local", false, false, List.of());
    }
}
