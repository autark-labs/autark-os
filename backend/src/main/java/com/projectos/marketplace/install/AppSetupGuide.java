package com.projectos.marketplace.install;

import java.util.List;

public record AppSetupGuide(
        String kind,
        String automation,
        List<AppSetupField> generatedValues,
        List<AppSetupField> copyableFields,
        List<AppSetupField> qrFields,
        List<AppSetupIntegration> integrations,
        List<String> userSteps,
        List<String> automationCapabilities) {
}
