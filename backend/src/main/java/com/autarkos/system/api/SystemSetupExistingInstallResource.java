package com.autarkos.system.api;

public record SystemSetupExistingInstallResource(
        String id,
        String label,
        String kind,
        String ownershipState,
        String ownerInstanceId,
        String summary,
        String route) {
}
