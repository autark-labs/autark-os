package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;

import com.autarkos.host.DockerInventorySnapshot;
import com.autarkos.host.HostModels;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.testsupport.DockerInventoryTestData;

class ManagedStorageContractServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void provesSavedComposeMetadataAndLiveMountsAsOneContract() throws Exception {
        Path appRoot = prepareRuntime();
        List<RuntimeModels.ManagedMount> mounts = ManagedStorageContractService.readComposeMounts(appRoot.resolve("compose.yaml"));
        InstalledApp app = app(appRoot);
        RuntimeModels.AppRuntimeMetadata metadata = metadata(mounts);
        HostModels.HostDockerContainer container = new HostModels.HostDockerContainer(
                "vaultwarden", "vaultwarden/server:latest", "Up 2 minutes",
                Map.of("com.docker.compose.service", "vaultwarden"), "",
                List.of(new HostModels.HostDockerMount("bind", appRoot.resolve("data").toString(), "/data", false)));
        DockerInventorySnapshot snapshot = DockerInventorySnapshot.available(
                Instant.parse("2026-06-20T12:00:00Z"), "current-instance",
                List.of(new DockerInventorySnapshot.Container(
                        container,
                        new RuntimeModels.DockerResourceClassification(
                                DockerResourceOwnership.OWNED, "vaultwarden", "appinst_vaultwarden", "autarkos_current_vaultwarden"))));

        ManagedStorageContractService.Contract contract = service(snapshot).require(app, metadata, true);

        assertThat(contract.protectedPaths()).containsEntry("data", appRoot.resolve("data"));
    }

    @Test
    void blocksAContainerWhoseLiveMountDoesNotMatchTheRecordedContract() throws Exception {
        Path appRoot = prepareRuntime();
        List<RuntimeModels.ManagedMount> mounts = ManagedStorageContractService.readComposeMounts(appRoot.resolve("compose.yaml"));
        HostModels.HostDockerContainer container = new HostModels.HostDockerContainer(
                "vaultwarden", "vaultwarden/server:latest", "Up 2 minutes",
                Map.of("com.docker.compose.service", "vaultwarden"), "",
                List.of(new HostModels.HostDockerMount("bind", tempDir.resolve("wrong-data").toString(), "/data", false)));
        DockerInventorySnapshot snapshot = DockerInventorySnapshot.available(
                Instant.parse("2026-06-20T12:00:00Z"), "current-instance",
                List.of(new DockerInventorySnapshot.Container(
                        container,
                        new RuntimeModels.DockerResourceClassification(
                                DockerResourceOwnership.OWNED, "vaultwarden", "appinst_vaultwarden", "autarkos_current_vaultwarden"))));

        assertThatThrownBy(() -> service(snapshot).require(app(appRoot), metadata(mounts), true))
                .isInstanceOf(InstallationException.class)
                .hasMessageContaining("live container does not use its recorded durable storage");
    }

    private Path prepareRuntime() throws Exception {
        Path appRoot = tempDir.resolve("vaultwarden").toAbsolutePath().normalize();
        Files.createDirectories(appRoot.resolve("data"));
        try (var source = new ClassPathResource("catalog/apps/vaultwarden/manifest.yaml").getInputStream()) {
            Files.copy(source, appRoot.resolve("manifest.yaml"));
        }
        Files.writeString(appRoot.resolve("compose.yaml"), """
                services:
                  vaultwarden:
                    image: vaultwarden/server:latest
                    volumes:
                      - "%s:/data"
                """.formatted(appRoot.resolve("data")));
        return appRoot;
    }

    private ManagedStorageContractService service(DockerInventorySnapshot snapshot) {
        return new ManagedStorageContractService(
                new ManifestYamlReader(),
                new ManifestValidator(),
                DockerInventoryTestData.service(snapshot),
                new AppRuntimeMetadataReader());
    }

    private InstalledApp app(Path appRoot) {
        return new InstalledApp("vaultwarden", "Vaultwarden", "Ready", appRoot.toString(),
                "autarkos_current_vaultwarden", "http://localhost:8080", Instant.parse("2026-06-20T12:00:00Z"));
    }

    private RuntimeModels.AppRuntimeMetadata metadata(List<RuntimeModels.ManagedMount> mounts) {
        return new RuntimeModels.AppRuntimeMetadata(
                "appinst_vaultwarden", "vaultwarden", "current-instance", "autarkos_current_vaultwarden",
                "1.36.0", Instant.parse("2026-06-20T12:00:00Z"), mounts);
    }
}
