package com.autarkos.system;

import java.time.Instant;
import java.util.List;

public final class SystemSetupModels {

    private SystemSetupModels() {
    }

    public record SystemDoctorStatus(
            String status,
            String headline,
            String summary,
            SystemReadinessStatus readiness,
            List<SystemSetupCheck> checks,
            List<SystemSetupCheck> repairableChecks,
            String detectedOs,
            String packageManager,
            boolean automatedDependencyInstallSupported,
            String lanUrl,
            Instant checkedAt) {
    }

    public record SystemReadinessGroup(
            String id,
            String label,
            String status,
            String message,
            List<SystemSetupCheck> checks) {
    }

    public record SystemReadinessStatus(
            String status,
            String headline,
            String summary,
            boolean canCompleteOnboarding,
            boolean finishAnywayRequiresAdvanced,
            List<SystemReadinessGroup> groups) {
    }

    public record SystemSetupAction(
            String id,
            String label,
            String route,
            String style) {
    }

    public record SystemSetupCheck(
            String id,
            String label,
            String status,
            String message,
            String detail,
            String actionLabel,
            String actionCommand) {
    }

    public record SystemSetupExistingInstallReport(
            boolean conflict,
            boolean developmentInstanceAllowed,
            String severity,
            String headline,
            String summary,
            List<SystemSetupExistingInstallResource> resources,
            List<SystemSetupAction> actions) {
    }

    public record SystemSetupExistingInstallResource(
            String id,
            String label,
            String kind,
            String ownershipState,
            String ownerInstanceId,
            String summary,
            String route) {
    }

    public record SystemSetupStatus(
            String status,
            String headline,
            String summary,
            String runAsUser,
            String expectedUser,
            boolean devMode,
            String activeProfiles,
            String backendPort,
            String backendContextPath,
            String dockerVersion,
            String tailscaleVersion,
            String instanceId,
            String instanceSlug,
            SystemSetupExistingInstallReport existingInstall,
            String installCommand,
            List<SystemSetupCheck> checks,
            Instant checkedAt) {
    }
}
