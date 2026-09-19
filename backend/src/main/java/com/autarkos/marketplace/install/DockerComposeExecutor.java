package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import com.autarkos.marketplace.install.models.RuntimeModels;

public interface DockerComposeExecutor {
    RuntimeModels.DockerComposeResult up(Path composeFile, String projectName);

    /**
     * Pulls the exact images referenced by a staged Compose file before that
     * file becomes the live runtime configuration.
     */
    default RuntimeModels.DockerComposeResult pull(Path composeFile, String projectName) {
        return new RuntimeModels.DockerComposeResult(1, List.of("This Docker executor cannot pull a staged app release."));
    }

    /**
     * Returns immutable repository digests for the supplied image references.
     * A release that cannot be resolved this way is not safe to roll back.
     */
    default Map<String, String> imageDigests(List<String> images) {
        return Map.of();
    }

    RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName);

    RuntimeModels.DockerComposeResult restart(Path composeFile, String projectName);

    RuntimeModels.DockerComposeResult down(Path composeFile, String projectName);

    RuntimeModels.DockerComposeResult ps(Path composeFile, String projectName);

    List<RuntimeModels.DockerContainerStatus> containers(Path composeFile, String projectName);

    List<RuntimeModels.ContainerTelemetry> stats(List<String> containerNames);
}
