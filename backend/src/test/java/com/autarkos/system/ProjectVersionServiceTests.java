package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.jar.Attributes;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class ProjectVersionServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void versionStatusPointsUsersToTheUnifiedUpdaterWithoutClaimingAnUpdateExists() {
        AutarkOsRuntimeProperties runtimeProperties = new AutarkOsRuntimeProperties();
        runtimeProperties.setRuntimeRoot("/tmp/autark-os-version-test");
        ProjectSettingsService settingsService = mock(ProjectSettingsService.class);
        when(settingsService.current()).thenReturn(ProjectSettings.defaults("autark-os"));
        InstanceIdentityService identityService = mock(InstanceIdentityService.class);
        when(identityService.current()).thenReturn(new AutarkOsIdentity(
                "instance-1",
                "instance-1",
                "/tmp/autark-os-version-test",
                "runtime-hash",
                Instant.parse("2026-07-14T12:00:00Z"),
                1));

        ProjectVersionInfo version = new ProjectVersionService(
                new RuntimeLayout(runtimeProperties),
                settingsService,
                identityService).info();

        assertThat(version.updateStatus()).isEqualTo("check_required");
        assertThat(version.updateMessage())
                .contains("autark-os update")
                .doesNotContain("cannot check for or install updates");
    }

    @Test
    void readsReleaseIdentityFromTheExecutableJarManifest() throws Exception {
        Path packagedJar = tempDir.resolve("autark-os-backend.jar");
        Manifest manifest = new Manifest();
        Attributes attributes = manifest.getMainAttributes();
        attributes.put(Attributes.Name.MANIFEST_VERSION, "1.0");
        attributes.put(Attributes.Name.IMPLEMENTATION_VERSION, "1.2.3-beta.4");
        attributes.putValue("Autark-OS-Build-Sha", "release-sha");
        attributes.putValue("Autark-OS-Build-Date", "2026-07-19T18:00:00Z");
        try (JarOutputStream ignored = new JarOutputStream(Files.newOutputStream(packagedJar), manifest)) {
            // The release identity lives in the manifest; no entries are needed.
        }

        AutarkOsRuntimeProperties runtimeProperties = new AutarkOsRuntimeProperties();
        runtimeProperties.setRuntimeRoot(tempDir.resolve("runtime").toString());
        ProjectSettingsService settingsService = mock(ProjectSettingsService.class);
        when(settingsService.current()).thenReturn(ProjectSettings.defaults("autark-os"));
        InstanceIdentityService identityService = mock(InstanceIdentityService.class);
        when(identityService.current()).thenReturn(new AutarkOsIdentity(
                "instance-1",
                "instance-1",
                runtimeProperties.getRuntimeRoot(),
                "runtime-hash",
                Instant.parse("2026-07-19T18:00:00Z"),
                1));

        ProjectVersionInfo version = new ProjectVersionService(
                new RuntimeLayout(runtimeProperties),
                settingsService,
                identityService,
                packagedJar).info();

        assertThat(version.version()).isEqualTo("1.2.3-beta.4");
        assertThat(version.buildSha()).isEqualTo("release-sha");
        assertThat(version.buildDate()).isEqualTo("2026-07-19T18:00:00Z");
    }
}
