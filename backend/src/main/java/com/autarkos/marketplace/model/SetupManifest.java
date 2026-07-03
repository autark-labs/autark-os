package com.autarkos.marketplace.model;

import java.util.List;

public record SetupManifest(
        String kind,
        String automation,
        List<SetupGeneratedValue> generatedValues,
        List<SetupField> copyableFields,
        List<SetupField> qrFields,
        List<SetupIntegration> integrations,
        List<String> userSteps,
        List<String> automationCapabilities) {

    public static SetupManifest defaults() {
        return new SetupManifest(
                "basic",
                "manual",
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());
    }
}
