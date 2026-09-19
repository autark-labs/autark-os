package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.models.AccessModels.AppAccessCheck;
import com.autarkos.marketplace.install.models.RuntimeModels.DockerContainerStatus;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.HealthManifest;

class InstallStartupCheckerTests {
    private final DockerComposeExecutor docker = mock(DockerComposeExecutor.class);
    private final AppAccessChecker access = spy(new AppAccessChecker());
    private final InstallStartupChecker checker = new InstallStartupChecker(docker, access);

    @Test
    void healthyDockerWithUnreachableWebLinkIsNotSuccessful() {
        containers("running", "healthy");
        doReturn(AppAccessCheck.unreachable("homepage", "http://localhost:3003"))
                .when(access).localHealthCheck(anyString(), any(), anyString());
        var result = check(manifest("homepage", 0));
        assertThat(result.ready()).isFalse();
        assertThat(result.detail()).contains("local app link did not respond", "timed out");
    }

    @Test
    void waitsForWebReadinessWithinTheManifestStartupWindow() {
        containers("running", "healthy");
        doReturn(AppAccessCheck.unreachable("homepage", "http://localhost:3003"),
                AppAccessCheck.reachable("homepage", "http://localhost:3003"))
                .when(access).localHealthCheck(anyString(), any(), anyString());
        assertThat(check(manifest("homepage", 5)).ready()).isTrue();
        verify(access, times(2)).localHealthCheck(anyString(), any(), anyString());
    }

    @Test
    void startingContainerIsNotDeclaredSuccessfulWhenItsWindowExpires() {
        containers("running", "starting");
        var result = check(manifest("homepage", 0));
        assertThat(result.ready()).isFalse();
        assertThat(result.detail()).contains("did not finish starting", "timed out");
        verify(access, never()).localHealthCheck(anyString(), any(), anyString());
    }

    @Test
    void stoppedContainerFailsWithoutWaitingForTheStartupWindow() {
        containers("exited", "");
        var result = check(manifest("homepage", 180));
        assertThat(result.ready()).isFalse();
        assertThat(result.detail()).contains("could not start", "exited");
    }

    @Test
    void missingRequiredServiceUsesTheSameFailureAsMonitoring() {
        containers("running", "healthy");
        var result = check(manifest("paperless-ngx", 180));
        assertThat(result.ready()).isFalse();
        assertThat(result.detail()).contains("missing required service");
    }

    @Test
    void containerOnlyAppsDoNotRequireAWebEndpoint() {
        containers("running", "healthy");
        var manifest = manifest("homepage", 0);
        doReturn(new HealthManifest("container", "", 0, "Ready", "Starting", "Failed", "Container is running."))
                .when(manifest).health();
        assertThat(check(manifest).ready()).isTrue();
        verify(access, never()).localHealthCheck(anyString(), any(), anyString());
    }

    private void containers(String state, String health) {
        when(docker.containers(any(), anyString())).thenReturn(List.of(
                new DockerContainerStatus("homepage", "homepage", state, health, state, "0.0.0.0:3003->3000/tcp")));
    }

    private InstallStartupChecker.StartupCheck check(ApplicationManifest manifest) {
        return checker.waitForStartup(Path.of("compose.yaml"), "autarkos-app", manifest, "http://localhost:3003");
    }

    private ApplicationManifest manifest(String id, int seconds) {
        var manifest = spy(new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()).findById(id).orElseThrow());
        var health = manifest.health();
        doReturn(new HealthManifest(health.type(), health.path(), seconds, health.successLabel(), health.startingLabel(), health.failureLabel(), health.description()))
                .when(manifest).health();
        return manifest;
    }
}
