package com.projectos.marketplace.install;

import java.util.List;
import java.util.Map;

public record PostInstallProvisioningResult(
        List<InstallStep> steps,
        List<String> logs,
        Map<String, String> values) {

    public static PostInstallProvisioningResult empty() {
        return new PostInstallProvisioningResult(List.of(), List.of(), Map.of());
    }
}
