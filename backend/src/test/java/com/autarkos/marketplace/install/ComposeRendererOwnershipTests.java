package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.AutarkOsIdentity;

class ComposeRendererOwnershipTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void rendersScopedDockerLabelsAndContainerName() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        DockerOwnershipService ownershipService = ownershipService(false);
        ApplicationManifest manifest = manifest("vaultwarden");
        ComposeRenderer renderer = new ComposeRenderer(runtimeLayout, ownershipService);
        String composeProject = ownershipService.composeProject(manifest.id());

        Path compose = renderer.render(
                manifest,
                runtimeLayout.appRoot(manifest.id()),
                new ResolvedRuntimeConfiguration(manifest.runtime().ports(), manifest.accessUrl()),
                "appinst_vaultwarden",
                composeProject);

        assertThat(Files.readString(compose))
                .contains("container_name: autarkos_homelab-box_vaultwarden")
                .contains("autark-os.managed=true")
                .contains("autark-os.instance-id=pos_abcdef1234567890")
                .contains("autark-os.runtime-root-hash=sha256:runtimehash")
                .contains("autark-os.app-id=vaultwarden")
                .contains("autark-os.app-instance-id=appinst_vaultwarden")
                .contains("autark-os.compose-project=autarkos_homelab-box_vaultwarden")
                .contains("autark-os.version=0.2.0");
    }

    @Test
    void rendersScopedNamesForMultiServiceApps() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        DockerOwnershipService ownershipService = ownershipService(false);
        ApplicationManifest manifest = manifest("paperless-ngx");
        ComposeRenderer renderer = new ComposeRenderer(runtimeLayout, ownershipService);
        String composeProject = ownershipService.composeProject(manifest.id());

        Path compose = renderer.render(
                manifest,
                runtimeLayout.appRoot(manifest.id()),
                new ResolvedRuntimeConfiguration(manifest.runtime().ports(), manifest.accessUrl()),
                "appinst_paperless",
                composeProject);

        assertThat(Files.readString(compose))
                .contains("container_name: autarkos_homelab-box_paperless-ngx_web")
                .contains("container_name: autarkos_homelab-box_paperless-ngx_broker")
                .contains("container_name: autarkos_homelab-box_paperless-ngx_db")
                .contains("autark-os.app-instance-id=appinst_paperless");
    }

    private DockerOwnershipService ownershipService(boolean devMode) {
        AutarkOsIdentity identity = new AutarkOsIdentity(
                "pos_abcdef1234567890",
                "homelab-box",
                runtimeRoot.toString(),
                "sha256:runtimehash",
                Instant.parse("2026-06-20T12:00:00Z"),
                1);
        return new DockerOwnershipService(() -> identity, () -> "0.2.0", devMode);
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private ApplicationManifest manifest(String appId) {
        return new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator())
                .findById(appId)
                .orElseThrow();
    }
}
