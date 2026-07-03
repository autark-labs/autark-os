package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.util.List;

public interface DockerComposeExecutor {
    DockerComposeResult up(Path composeFile, String projectName);

    DockerComposeResult stop(Path composeFile, String projectName);

    DockerComposeResult restart(Path composeFile, String projectName);

    DockerComposeResult down(Path composeFile, String projectName);

    DockerComposeResult ps(Path composeFile, String projectName);

    List<DockerContainerStatus> containers(Path composeFile, String projectName);

    List<ContainerTelemetry> stats(List<String> containerNames);
}
