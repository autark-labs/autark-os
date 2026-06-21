package com.projectos.system;

import org.springframework.stereotype.Service;

import com.projectos.host.HostInventoryProvider;

@Service
public class SetupStatusService {

    private final SetupProgressService progressService;
    private final HostInventoryProvider hostInventoryProvider;

    public SetupStatusService(SetupProgressService progressService, HostInventoryProvider hostInventoryProvider) {
        this.progressService = progressService;
        this.hostInventoryProvider = hostInventoryProvider;
    }

    public SetupStatus status() {
        SetupProgress progress = progressService.status();
        if (progress.setupComplete()) {
            return new SetupStatus(true, "done", "Setup is complete.");
        }
        boolean hasFoundResources = hostInventoryProvider.inventory(false).stream()
                .anyMatch(resource -> !"owned_managed".equals(resource.ownershipState()));
        if (hasFoundResources) {
            return new SetupStatus(false, "existing_apps", "Project OS found existing apps on this server.");
        }
        return new SetupStatus(false, mapStep(progress.lastRecommendedStep()), message(progress.lastRecommendedStep()));
    }

    private String mapStep(String progressStep) {
        return switch (progressStep) {
            case "welcome", "host_check", "docker_check" -> "host_check";
            case "access_choice", "tailscale_connect" -> "tailscale";
            case "starter_apps" -> "starter_apps";
            case "first_backup" -> "first_backup";
            case "done" -> "done";
            default -> "host_check";
        };
    }

    private String message(String progressStep) {
        return switch (mapStep(progressStep)) {
            case "tailscale" -> "Choose how Project OS should handle private access.";
            case "starter_apps" -> "Choose starter apps to install.";
            case "first_backup" -> "Create or skip the first restore point.";
            case "done" -> "Setup is ready to complete.";
            default -> "Check this server before installing apps.";
        };
    }
}
