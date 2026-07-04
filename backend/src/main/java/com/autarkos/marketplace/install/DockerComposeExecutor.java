package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.util.List;

import com.autarkos.marketplace.install.models.RuntimeModels;

public interface DockerComposeExecutor {
    RuntimeModels.DockerComposeResult up(Path composeFile, String projectName);

    RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName);

    RuntimeModels.DockerComposeResult restart(Path composeFile, String projectName);

    RuntimeModels.DockerComposeResult down(Path composeFile, String projectName);

    RuntimeModels.DockerComposeResult ps(Path composeFile, String projectName);

    List<RuntimeModels.DockerContainerStatus> containers(Path composeFile, String projectName);

    List<RuntimeModels.ContainerTelemetry> stats(List<String> containerNames);
}
