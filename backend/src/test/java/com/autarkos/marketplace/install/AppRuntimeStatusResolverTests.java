package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.RuntimeModels;

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

        assertThat(accessUrl).isEqualTo("http://localhost:18090");
    }
}
