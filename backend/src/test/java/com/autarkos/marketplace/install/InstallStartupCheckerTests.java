package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.HealthManifest;

class InstallStartupCheckerTests {

    private static final HealthManifest HEALTH = new HealthManifest(
            "http", "/", 180, "Ready to open", "Starting up", "Needs attention", "Checks the local app link.");

    @Test
    void reportsReadyWhenDockerHasAStableRunningContainer() {
        InstallStartupChecker.StartupCheck check = new InstallStartupChecker(new FixedContainerExecutor(List.of(
                container("running", "healthy", "Up 2 minutes (healthy)"))))
                .waitForStartup(Path.of("compose.yaml"), "autarkos-vaultwarden", HEALTH);

        assertThat(check.ready()).isTrue();
        assertThat(check.failed()).isFalse();
        assertThat(check.warmingUp()).isFalse();
        assertThat(check.detail()).isEqualTo("The app container is running. Autark-OS will keep checking the app link from Applications.");
    }

    @Test
    void reportsTheDockerStateWhenAContainerFailsDuringStartup() {
        InstallStartupChecker.StartupCheck check = new InstallStartupChecker(new FixedContainerExecutor(List.of(
                container("exited", "", "Exited 1 second ago"))))
                .waitForStartup(Path.of("compose.yaml"), "autarkos-vaultwarden", HEALTH);

        assertThat(check.ready()).isFalse();
        assertThat(check.failed()).isTrue();
        assertThat(check.detail()).contains("stopped or reported unhealthy").contains("state=exited");
    }

    private static RuntimeModels.DockerContainerStatus container(String state, String health, String status) {
        return new RuntimeModels.DockerContainerStatus("autark-os-vaultwarden", "vaultwarden", state, health, status, "0.0.0.0:8090->80/tcp");
    }

    private record FixedContainerExecutor(List<RuntimeModels.DockerContainerStatus> containers) implements DockerComposeExecutor {
        @Override
        public RuntimeModels.DockerComposeResult up(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public RuntimeModels.DockerComposeResult restart(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public RuntimeModels.DockerComposeResult down(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public RuntimeModels.DockerComposeResult ps(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public List<RuntimeModels.DockerContainerStatus> containers(Path composeFile, String projectName) {
            return containers;
        }

        @Override
        public List<RuntimeModels.ContainerTelemetry> stats(List<String> containerNames) {
            return List.of();
        }
    }
}
