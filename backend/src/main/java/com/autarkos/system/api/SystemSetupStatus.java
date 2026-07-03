package com.autarkos.system.api;

import java.time.Instant;
import java.util.List;

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
