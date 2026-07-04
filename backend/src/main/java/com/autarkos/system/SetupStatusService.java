package com.autarkos.system;

import java.util.List;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;

@Service
public class SetupStatusService {

    private final SetupProgressService progressService;
    private final Supplier<List<ObservedService>> observedServices;

    @Autowired
    public SetupStatusService(SetupProgressService progressService, ObservedServiceService observedServiceService) {
        this(progressService, observedServiceService::observedServices);
    }

    SetupStatusService(SetupProgressService progressService, Supplier<List<ObservedService>> observedServices) {
        this.progressService = progressService;
        this.observedServices = observedServices;
    }

    public SetupProgressModels.SetupStatus status() {
        SetupProgressModels.SetupProgress progress = progressService.status();
        if (progress.setupComplete()) {
            return new SetupProgressModels.SetupStatus(true, "done", "Setup is complete.");
        }
        boolean hasFoundResources = observedServices.get().stream()
                .filter(service -> !"ignored".equals(service.userVisibility()))
                .anyMatch(service -> !"owned_managed".equals(service.ownershipState()));
        if (hasFoundResources) {
            return new SetupProgressModels.SetupStatus(false, "existing_apps", "Autark-OS found existing apps on this server.");
        }
        return new SetupProgressModels.SetupStatus(false, mapStep(progress.lastRecommendedStep()), message(progress.lastRecommendedStep()));
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
            case "tailscale" -> "Choose how Autark-OS should handle private access.";
            case "starter_apps" -> "Choose starter apps to install.";
            case "first_backup" -> "Create or skip the first restore point.";
            case "done" -> "Setup is ready to complete.";
            default -> "Check this server before installing apps.";
        };
    }
}
