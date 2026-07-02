package com.projectos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.catalog.ManifestValidator;
import com.projectos.marketplace.catalog.ManifestYamlReader;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.system.ProjectOsIdentity;

class AppRuntimeMetadataWriterTests {

    @TempDir
    Path appRoot;

    @Test
    void writesAppRuntimeMetadataNextToComposeFile() throws Exception {
        ApplicationManifest manifest = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator())
                .findById("vaultwarden")
                .orElseThrow();
        ProjectOsIdentity identity = new ProjectOsIdentity(
                "pos_abcdef1234567890",
                "homelab-box",
                "/var/lib/project-os",
                "sha256:runtimehash",
                Instant.parse("2026-06-20T12:00:00Z"),
                1);
        AppRuntimeMetadataWriter writer = new AppRuntimeMetadataWriter(
                () -> identity,
                () -> Instant.parse("2026-06-20T13:00:00Z"));

        AppRuntimeMetadata metadata = writer.write(manifest, appRoot, "appinst_vaultwarden", "projectos_homelab-box_vaultwarden");

        assertThat(metadata.appInstanceId()).isEqualTo("appinst_vaultwarden");
        assertThat(metadata.catalogAppId()).isEqualTo("vaultwarden");
        assertThat(metadata.instanceId()).isEqualTo("pos_abcdef1234567890");
        assertThat(metadata.composeProject()).isEqualTo("projectos_homelab-box_vaultwarden");
        assertThat(metadata.manifestVersion()).isEqualTo("1.36.0");
        assertThat(metadata.createdAt()).isEqualTo(Instant.parse("2026-06-20T13:00:00Z"));
        assertThat(Files.readString(appRoot.resolve("project-os-app.json")))
                .contains("\"appInstanceId\" : \"appinst_vaultwarden\"")
                .contains("\"catalogAppId\" : \"vaultwarden\"")
                .contains("\"instanceId\" : \"pos_abcdef1234567890\"");
    }
}
