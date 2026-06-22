package com.projectos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.projectos.marketplace.install.AppTelemetry;
import com.projectos.marketplace.install.AppTelemetryService;
import com.projectos.marketplace.install.ContainerTelemetry;
import com.projectos.marketplace.install.DockerComposeExecutor;
import com.projectos.marketplace.install.DockerComposeResult;
import com.projectos.marketplace.install.DockerContainerStatus;
import com.projectos.marketplace.install.InstalledApp;

class AppTelemetryServiceTests {

    @Test
    void telemetryForAppUsesComposeContainersAndStats() {
        FakeDockerComposeExecutor composeExecutor = new FakeDockerComposeExecutor();
        AppTelemetryService service = new AppTelemetryService(composeExecutor);

        AppTelemetry telemetry = service.telemetry(installedApp("vaultwarden"));

        assertThat(telemetry.cpuPercent()).isEqualTo("1.25%");
        assertThat(composeExecutor.lastComposeFile).isEqualTo(Path.of("/tmp/project-os/apps/vaultwarden/compose.yaml"));
        assertThat(composeExecutor.lastProjectName).isEqualTo("project-os-vaultwarden");
    }

    @Test
    void telemetryForAppsUsesAppIdsAsKeys() {
        AppTelemetryService service = new AppTelemetryService(new FakeDockerComposeExecutor());

        Map<String, AppTelemetry> telemetry = service.telemetryForApps(List.of(installedApp("vaultwarden")));

        assertThat(telemetry).containsKey("vaultwarden");
        assertThat(telemetry.get("vaultwarden").memoryPercent()).isEqualTo("4.8%");
    }

    private static InstalledApp installedApp(String appId) {
        return new InstalledApp(
                appId,
                "Vaultwarden",
                "Ready",
                "/tmp/project-os/apps/" + appId,
                "project-os-" + appId,
                "http://localhost:8090",
                Instant.parse("2026-06-11T00:00:00Z"));
    }

    private static class FakeDockerComposeExecutor implements DockerComposeExecutor {
        Path lastComposeFile;
        String lastProjectName;

        @Override
        public DockerComposeResult up(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public DockerComposeResult stop(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public DockerComposeResult restart(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public DockerComposeResult down(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public DockerComposeResult ps(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public List<DockerContainerStatus> containers(Path composeFile, String projectName) {
            lastComposeFile = composeFile;
            lastProjectName = projectName;
            return List.of(new DockerContainerStatus(
                    "project-os-vaultwarden",
                    "vaultwarden",
                    "running",
                    "healthy",
                    "Up 2 minutes (healthy)",
                    "0.0.0.0:8090->80/tcp"));
        }

        @Override
        public List<ContainerTelemetry> stats(List<String> containerNames) {
            return List.of(new ContainerTelemetry(
                    "project-os-vaultwarden",
                    "1.25%",
                    "96MiB / 2GiB",
                    "4.8%",
                    "12kB / 5kB",
                    "4MB / 1MB"));
        }
    }
}
