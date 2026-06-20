package com.projectos.marketplace.plan;

import java.util.List;

public record TechnicalInstallPlan(
        String runtimeRoot,
        String composeProject,
        List<PlannedContainer> containers,
        String network,
        List<String> ports,
        List<String> volumes,
        List<String> labels,
        List<String> backupPaths) {
}
