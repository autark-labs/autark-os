package com.projectos.marketplace.install;

import java.time.Instant;

public record InstalledApp(
        String appId,
        String appName,
        String status,
        String runtimePath,
        String composeProject,
        String accessUrl,
        Instant installedAt) {
}
