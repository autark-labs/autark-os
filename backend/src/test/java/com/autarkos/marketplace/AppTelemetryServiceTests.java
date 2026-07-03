package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.AppTelemetry;
import com.autarkos.marketplace.install.AppTelemetryService;
import com.autarkos.marketplace.install.ContainerTelemetry;
import com.autarkos.marketplace.install.DockerComposeExecutor;
import com.autarkos.marketplace.install.DockerComposeResult;
import com.autarkos.marketplace.install.DockerContainerStatus;
import com.autarkos.marketplace.install.InstalledApp;

class AppTelemetryServiceTests {

    @Test
    void telemetryForAppUsesComposeContainersAndStats() {
        FakeDockerComposeExecutor composeExecutor = new FakeDockerComposeExecutor();
        AppTelemetryService service = new AppTelemetryService(composeExecutor);

        AppTelemetry telemetry = service.telemetry(installedApp("vaultwarden"));

        assertThat(telemetry.cpuPercent()).isEqualTo("1.25%");
        assertThat(composeExecutor.lastComposeFile).isEqualTo(Path.of("/tmp/autark-os/apps/vaultwarden/compose.yaml"));
        assertThat(composeExecutor.lastProjectName).isEqualTo("autark-os-vaultwarden");
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
                "/tmp/autark-os/apps/" + appId,
                "autark-os-" + appId,
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
                    "autark-os-vaultwarden",
                    "vaultwarden",
                    "running",
                    "healthy",
                    "Up 2 minutes (healthy)",
                    "0.0.0.0:8090->80/tcp"));
        }

        @Override
        public List<ContainerTelemetry> stats(List<String> containerNames) {
            return List.of(new ContainerTelemetry(
                    "autark-os-vaultwarden",
                    "1.25%",
                    "96MiB / 2GiB",
                    "4.8%",
                    "12kB / 5kB",
                    "4MB / 1MB"));
        }
    }
}
