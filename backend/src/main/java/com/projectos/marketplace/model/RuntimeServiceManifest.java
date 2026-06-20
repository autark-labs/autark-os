package com.projectos.marketplace.model;

import java.util.List;

public record RuntimeServiceManifest(
        String name,
        String containerName,
        String image,
        List<String> ports,
        List<String> volumes,
        List<String> environment,
        List<String> dependsOn,
        List<String> labels,
        HealthManifest health,
        boolean privileged) {
}
