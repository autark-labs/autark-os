package com.autarkos.marketplace.model;

import java.util.List;

public record RuntimeManifest(
        String containerName,
        String composeProject,
        String image,
        String network,
        String runtimeRoot,
        List<String> ports,
        List<String> volumes,
        List<String> environment,
        List<String> labels,
        List<String> backupPaths,
        boolean privileged,
        List<RuntimeServiceManifest> services) {

    public RuntimeManifest(
            String containerName,
            String composeProject,
            String image,
            String network,
            String runtimeRoot,
            List<String> ports,
            List<String> volumes,
            List<String> environment,
            List<String> labels,
            List<String> backupPaths,
            boolean privileged) {
        this(containerName, composeProject, image, network, runtimeRoot, ports, volumes, environment, labels, backupPaths, privileged, List.of());
    }

    public boolean multiService() {
        return services != null && !services.isEmpty();
    }
}
