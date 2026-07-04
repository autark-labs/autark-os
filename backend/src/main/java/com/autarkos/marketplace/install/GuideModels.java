package com.autarkos.marketplace.install;

import java.util.List;
import java.util.Map;

public final class GuideModels {

    private GuideModels() {
    }

    public record AppSetupField(
            String label,
            String value,
            boolean sensitive,
            boolean qr,
            boolean recoverable) {
    }

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

    public record AppSetupIntegration(
            String id,
            String name,
            String targetAppId,
            String status,
            String description,
            boolean requiresApproval,
            List<String> plannedActions) {
    }

    public record PostInstallGuide(
            String kind,
            String primaryAction,
            String openUrlLabel,
            String headline,
            String summary,
            List<String> setupSteps,
            List<PostInstallValue> values,
            List<String> notes) {
    }

    public record PostInstallProvisioningResult(
            List<InstallModels.InstallStep> steps,
            List<String> logs,
            Map<String, String> values) {

        public static PostInstallProvisioningResult empty() {
            return new PostInstallProvisioningResult(List.of(), List.of(), Map.of());
        }
    }

    public record PostInstallValue(
            String label,
            String value,
            boolean sensitive,
            boolean qr) {
    }
}
