package com.projectos.system.api;

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
        String installCommand,
        List<SystemSetupCheck> checks,
        Instant checkedAt) {
}
