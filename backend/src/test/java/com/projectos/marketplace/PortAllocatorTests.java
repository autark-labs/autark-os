package com.projectos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.ServerSocket;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.projectos.marketplace.install.PortAllocator;
import com.projectos.marketplace.api.InstallOptionsRequest;
import com.projectos.marketplace.install.ResolvedRuntimeConfiguration;
import com.projectos.marketplace.model.AccessManifest;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.marketplace.model.CatalogSmokeTest;
import com.projectos.marketplace.model.HealthManifest;
import com.projectos.marketplace.model.RuntimeManifest;
import com.projectos.marketplace.model.SetupManifest;
import com.projectos.marketplace.model.UsageManifest;

class PortAllocatorTests {

    @Test
    void keepsPreferredPortWhenAvailable() {
        int port = availablePort();
        ApplicationManifest manifest = manifest(port + ":80");

        ResolvedRuntimeConfiguration configuration = new PortAllocator().resolve(manifest);

        assertThat(configuration.ports()).containsExactly(port + ":80");
        assertThat(configuration.accessUrl()).isEqualTo("http://localhost:" + port);
    }

    @Test
    void movesToNextPortWhenPreferredPortIsBusy() throws Exception {
        int port = availablePortWithFreeNeighbor();
        try (ServerSocket ignored = new ServerSocket(port)) {
            ApplicationManifest manifest = manifest(port + ":80");

            ResolvedRuntimeConfiguration configuration = new PortAllocator().resolve(manifest);

            assertThat(configuration.ports()).containsExactly((port + 1) + ":80");
            assertThat(configuration.accessUrl()).isEqualTo("http://localhost:" + (port + 1));
        }
    }

    @Test
    void explicitBusyPortFailsInsteadOfMoving() throws Exception {
        int port = availablePortWithFreeNeighbor();
        try (ServerSocket ignored = new ServerSocket(port)) {
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> new PortAllocator().resolvePorts(manifest(port + ":80"), new InstallOptionsRequest.PortOptions(port)))
                    .hasMessageContaining("already in use");
        }
    }

    @Test
    void multiPortAppsUseManifestWebPortForAccessUrl() {
        int webPort = availablePort();
        int sshPort = availablePort();
        ApplicationManifest manifest = manifest("http://localhost:" + webPort, List.of(sshPort + ":22", webPort + ":3000"));

        ResolvedRuntimeConfiguration configuration = new PortAllocator().resolve(manifest);

        assertThat(configuration.accessUrl()).isEqualTo("http://localhost:" + webPort);
    }

    private int availablePort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("Unable to allocate test port.", exception);
        }
    }

    private int availablePortWithFreeNeighbor() {
        for (int port = 20000; port < 65000; port++) {
            if (canBind(port) && canBind(port + 1)) {
                return port;
            }
        }
        throw new IllegalStateException("Unable to find adjacent available test ports.");
    }

    private boolean canBind(int port) {
        try (ServerSocket ignored = new ServerSocket(port)) {
            return true;
        } catch (java.io.IOException exception) {
            return false;
        }
    }

    private ApplicationManifest manifest(String port) {
        return manifest("http://localhost:9999", List.of(port));
    }

    private ApplicationManifest manifest(String accessUrl, List<String> ports) {
        return new ApplicationManifest(
                "test-app",
                "Test App",
                "Utilities",
                "Test app",
                "Test app",
                "Official",
                "0",
                "0",
                "",
                "1.0.0",
                "Today",
                "1 MB",
                "Autark-OS",
                "Local",
                "https://example.com/project-os/test-app",
                "https://example.com/project-os/test-app/docs",
                "1 minute",
                "Easy",
                "Ready",
                "Test manifest is ready for automated validation.",
                accessUrl,
                List.of(),
                List.of(),
                List.of(),
                "Test app",
                "Test app",
                List.of(),
                List.of(),
                List.of(),
                AccessManifest.defaults(),
                UsageManifest.defaults(),
                SetupManifest.defaults(),
                HealthManifest.defaults(AccessManifest.defaults(), UsageManifest.defaults()),
                List.of(new CatalogSmokeTest("Install plan", "Passed", "Validation test manifest has a generated install plan.")),
                new RuntimeManifest(
                        "test-app",
                        "project-os-test-app",
                        "test:latest",
                        "project-os-apps",
                        "/var/lib/project-os/apps/test-app",
                        ports,
                        List.of(),
                        List.of(),
                        List.of(),
                        List.of(),
                        false));
    }
}
