package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.models.RuntimeModels;

class AppRuntimeStatusResolverTests {

    private final AppRuntimeStatusResolver resolver = new AppRuntimeStatusResolver();

    @Test
    void classifiesContainerRuntimeStatusWithoutLifecycleServiceState() {
        AppRuntimeStatus status = resolver.normalize(List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 1 minute (healthy)",
                "0.0.0.0:8090->80/tcp")));

        assertThat(status.friendlyStatus()).isEqualTo("Ready");
        assertThat(status.healthCheck()).isEqualTo("passing");
        assertThat(status.technicalStatus()).isEqualTo("autark-os-vaultwarden: running (healthy)");
    }

    @Test
    void derivesPublishedAccessUrlFromContainerPorts() {
        InstalledApp app = new InstalledApp("vaultwarden", "Vaultwarden", "Ready", "/tmp/app", "autark-os-vaultwarden", "http://localhost:8090", java.time.Instant.now());

        String accessUrl = resolver.accessUrl(app, null, List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 1 minute",
                "0.0.0.0:18090->80/tcp")));

        assertThat(accessUrl).isEqualTo("http://" + com.autarkos.network.HostAddress.lanAddress() + ":18090");
    }

    @Test
    void loopbackBindingStaysServerOnlyDespiteAnOldLanAddress() {
        var app = new InstalledApp("syncthing", "Syncthing", "Ready", "/tmp/app", "project", "http://192.168.1.2:18384", java.time.Instant.now());
        assertThat(resolver.accessUrl(app, null, List.of(new RuntimeModels.DockerContainerStatus(
                "app", "app", "running", "healthy", "Up", "127.0.0.1:18384->8384/tcp, 0.0.0.0:22000->22000/tcp"))))
                .isEqualTo("http://localhost:18384");
    }

    @Test
    void neverMarksAnAppReadyWhenARunningServiceHasAnExitedRequiredDependency() {
        AppRuntimeStatus status = resolver.normalize(List.of(
                new RuntimeModels.DockerContainerStatus("app", "app", "running", "", "Up", ""),
                new RuntimeModels.DockerContainerStatus("database", "database", "exited", "", "Exited (1)", "")),
                List.of("app", "database"));

        assertThat(status.friendlyStatus()).isEqualTo("Needs attention");
        assertThat(status.healthCheck()).isEqualTo("incomplete");
        assertThat(status.technicalStatus()).contains("required service is stopped");
    }

    @Test
    void neverMarksAnAppReadyWhenARequiredServiceIsMissingFromDockerObservation() {
        AppRuntimeStatus status = resolver.normalize(List.of(
                new RuntimeModels.DockerContainerStatus("app", "app", "running", "", "Up", "")),
                List.of("app", "database"));

        assertThat(status.friendlyStatus()).isEqualTo("Needs attention");
        assertThat(status.healthCheck()).isEqualTo("incomplete");
        assertThat(status.technicalStatus()).contains("missing required service(s): database");
    }

    @Test
    void reportsCreatedContainersAsStartingRatherThanReady() {
        AppRuntimeStatus status = resolver.normalize(List.of(
                new RuntimeModels.DockerContainerStatus("app", "app", "running", "", "Up", ""),
                new RuntimeModels.DockerContainerStatus("database", "database", "created", "", "Created", "")),
                List.of("app", "database"));

        assertThat(status.friendlyStatus()).isEqualTo("Starting");
        assertThat(status.healthCheck()).isEqualTo("starting");
    }
}
