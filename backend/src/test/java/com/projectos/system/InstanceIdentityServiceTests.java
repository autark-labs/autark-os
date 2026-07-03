package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class InstanceIdentityServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void createsStableIdentityUnderRuntimeConfig() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout(tempDir.resolve("runtime/project-os"));
        InstanceIdentityService service = new InstanceIdentityService(
                runtimeLayout,
                () -> "Homelab Box",
                () -> "pos_testidentity000000000000000001",
                () -> Instant.parse("2026-06-20T12:00:00Z"));

        ProjectOsIdentity identity = service.current();

        assertThat(identity.instanceId()).isEqualTo("pos_testidentity000000000000000001");
        assertThat(identity.instanceSlug()).isEqualTo("homelab-box");
        assertThat(identity.runtimeRoot()).isEqualTo(runtimeLayout.runtimeRoot().toString());
        assertThat(identity.runtimeRootHash()).startsWith("sha256:");
        assertThat(identity.createdAt()).isEqualTo(Instant.parse("2026-06-20T12:00:00Z"));
        assertThat(identity.schemaVersion()).isEqualTo(1);
        assertThat(Files.exists(runtimeLayout.identityPath())).isTrue();
    }

    @Test
    void preservesExistingIdentityOnSubsequentReads() {
        RuntimeLayout runtimeLayout = runtimeLayout(tempDir.resolve("runtime/project-os"));
        InstanceIdentityService firstService = new InstanceIdentityService(
                runtimeLayout,
                () -> "First Host",
                () -> "pos_first",
                () -> Instant.parse("2026-06-20T12:00:00Z"));
        InstanceIdentityService secondService = new InstanceIdentityService(
                runtimeLayout,
                () -> "Renamed Host",
                () -> "pos_second",
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        ProjectOsIdentity first = firstService.current();
        ProjectOsIdentity second = secondService.current();

        assertThat(second).isEqualTo(first);
    }

    @Test
    void createsMissingConfigDirectory() {
        RuntimeLayout runtimeLayout = runtimeLayout(tempDir.resolve("missing/config/runtime"));

        ProjectOsIdentity identity = new InstanceIdentityService(
                runtimeLayout,
                () -> "Autark-OS",
                () -> "pos_created",
                () -> Instant.parse("2026-06-20T12:00:00Z")).current();

        assertThat(identity.instanceId()).isEqualTo("pos_created");
        assertThat(Files.isDirectory(runtimeLayout.configRoot())).isTrue();
    }

    @Test
    void refusesToOverwriteCorruptIdentity() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout(tempDir.resolve("runtime/project-os"));
        Files.createDirectories(runtimeLayout.configRoot());
        Files.writeString(runtimeLayout.identityPath(), "{not-json");

        InstanceIdentityService service = new InstanceIdentityService(
                runtimeLayout,
                () -> "Autark-OS",
                () -> "pos_replacement",
                () -> Instant.parse("2026-06-20T12:00:00Z"));

        assertThatThrownBy(service::current)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Autark-OS identity");
        assertThat(Files.readString(runtimeLayout.identityPath())).isEqualTo("{not-json");
    }

    private RuntimeLayout runtimeLayout(Path runtimeRoot) {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
