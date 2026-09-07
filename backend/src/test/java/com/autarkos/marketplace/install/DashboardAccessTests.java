package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.HostAddress;
import org.springframework.core.io.ClassPathResource;

class DashboardAccessTests {
    @TempDir Path root;

    @Test
    void accessChoiceControlsDashboardBindingAndSyncthingCannotExposeItsDashboard() throws Exception {
        var reader = new ManifestYamlReader();
        var manifest = reader.read(new ClassPathResource("catalog/apps/syncthing/manifest.yaml"));
        var props = new AutarkOsRuntimeProperties();
        props.setRuntimeRoot(root.toString());
        var layout = new RuntimeLayout(props);
        var resolver = new InstallCustomizationResolver(new PortAllocator());
        for (String mode : List.of("local", "private")) {
            var configuration = resolver.resolve(manifest, options(mode, freePort()));
            var path = new ComposeRenderer(layout).render(manifest, root.resolve(mode), configuration);
            String yaml = Files.readString(path);
            assertThat(yaml).contains("127.0.0.1:")
                    .contains(":22000/tcp\"").contains(":22000/udp\"").contains(":21027/udp\"");
            assertThat(configuration.accessUrl()).startsWith("http://localhost:");
        }
        for (String mode : List.of("network", "local-and-private")) {
            assertThatThrownBy(() -> resolver.resolve(manifest, options(mode, freePort())))
                    .hasMessageContaining("dashboard must stay");
        }
    }

    @Test
    void freshRssLanAndServerOnlyAreDifferentBindingsAndBrowserUrls() throws Exception {
        var manifest = new ManifestYamlReader().read(new ClassPathResource("catalog/apps/freshrss/manifest.yaml"));
        var props = new AutarkOsRuntimeProperties();
        props.setRuntimeRoot(root.toString());
        var renderer = new ComposeRenderer(new RuntimeLayout(props));
        var resolver = new InstallCustomizationResolver(new PortAllocator());
        var local = resolver.resolve(manifest, options("local", freePort()));
        var lan = resolver.resolve(manifest, options("network", freePort()));
        assertThat(Files.readString(renderer.render(manifest, root.resolve("local"), local))).contains("127.0.0.1:");
        assertThat(Files.readString(renderer.render(manifest, root.resolve("lan"), lan))).doesNotContain("127.0.0.1:");
        assertThat(lan.accessUrl()).startsWith("http://" + HostAddress.lanAddress() + ":");
    }

    @Test
    void settingsKeepExistingPeerBindingsEvenWhileTheyAreOccupied() throws Exception {
        var manifest = new ManifestYamlReader().read(new ClassPathResource("catalog/apps/syncthing/manifest.yaml"));
        try (var peer = new ServerSocket(0)) {
            String compose = "services:\n  syncthing:\n    ports:\n      - \"127.0.0.1:18384:8384\"\n      - \"" + peer.getLocalPort()
                    + ":22000/tcp\"\n      - \"22000:22000/udp\"\n      - \"21027:21027/udp\"\n";
            var result = new InstallCustomizationResolver(new PortAllocator()).resolveSettings(manifest, options("local", freePort()), compose);
            assertThat(result.ports()).contains(peer.getLocalPort() + ":22000/tcp", "22000:22000/udp", "21027:21027/udp");
            assertThat(result.ports()).hasSize(4);
        }
    }

    @Test
    void portEditsPreserveOwnershipAndEverythingOtherThanPorts() throws Exception {
        var manifest = new ManifestYamlReader().read(new ClassPathResource("catalog/apps/syncthing/manifest.yaml"));
        Path compose = root.resolve("compose.yaml");
        Files.writeString(compose, "services:\n  syncthing:\n    image: syncthing/syncthing:2.1.1\n    container_name: autarkos_owned_syncthing\n    labels:\n      - autark-os.instance-id=owner\n    volumes:\n      - /preserved/data:/var/syncthing/data\n    ports:\n      - '127.0.0.1:18384:8384'\n      - '22000:22000/tcp'\n      - '22000:22000/udp'\n      - '21027:21027/udp'\nnetworks:\n  default:\n    name: existing-network\n");
        var yaml = new org.yaml.snakeyaml.Yaml();
        java.util.Map<String, Object> before = yaml.load(Files.readString(compose));
        var result = new InstallCustomizationResolver(new PortAllocator()).resolveSettings(manifest, options("local", freePort()), Files.readString(compose));
        var props = new AutarkOsRuntimeProperties();props.setRuntimeRoot(root.toString());
        new ComposeRenderer(new RuntimeLayout(props)).updatePorts(compose, manifest, result);
        java.util.Map<String, Object> after = yaml.load(Files.readString(compose));
        assertThat(after.get("networks")).isEqualTo(before.get("networks"));
        @SuppressWarnings("unchecked") var beforeService = (java.util.Map<String, Object>) ((java.util.Map<?, ?>) before.get("services")).get("syncthing");
        @SuppressWarnings("unchecked") var afterService = (java.util.Map<String, Object>) ((java.util.Map<?, ?>) after.get("services")).get("syncthing");
        assertThat(afterService.remove("ports")).isNotEqualTo(beforeService.remove("ports"));
        assertThat(afterService).isEqualTo(beforeService);
    }

    private InstallOptionsRequest options(String mode, int port) {
        return new InstallOptionsRequest(new InstallOptionsRequest.PortOptions(port), new InstallOptionsRequest.AccessOptions(mode.contains("private"), mode), null, null);
    }

    private int freePort() throws Exception {
        try (var socket = new ServerSocket(0)) { return socket.getLocalPort(); }
    }
}
