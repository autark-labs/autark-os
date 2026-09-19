package com.autarkos.testsupport;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;

import com.autarkos.marketplace.install.AppRuntimeMetadataReader;
import com.autarkos.marketplace.install.AppRuntimeMetadataWriter;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.install.ManagedStorageContractService;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.AutarkOsIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;

public final class ManagedAppTestContract {

    private static final ObjectMapper JSON = new ObjectMapper();

    private ManagedAppTestContract() {
    }

    public static ManagedAppAttestationService service(
            InstalledAppRepository repository,
            RuntimeLayout runtimeLayout,
            AutarkOsIdentity identity) {
        DockerOwnershipService ownership = new DockerOwnershipService(() -> identity, () -> "test", false);
        ManagedStorageContractService storageContracts = org.mockito.Mockito.mock(ManagedStorageContractService.class);
        org.mockito.Mockito.when(storageContracts.require(
                        org.mockito.ArgumentMatchers.any(InstalledApp.class),
                        org.mockito.ArgumentMatchers.any(RuntimeModels.AppRuntimeMetadata.class),
                        org.mockito.ArgumentMatchers.anyBoolean()))
                .thenAnswer(invocation -> contract(invocation.getArgument(0)));
        return new ManagedAppAttestationService(repository, runtimeLayout, ownership, new AppRuntimeMetadataReader(), storageContracts);
    }

    private static ManagedStorageContractService.Contract contract(InstalledApp app) {
        return new ManagedStorageContractService.Contract(
                app,
                Map.of("data", Path.of(app.runtimePath()).toAbsolutePath().normalize()));
    }

    public static void writeAll(
            InstalledAppRepository repository,
            RuntimeLayout runtimeLayout,
            AutarkOsIdentity identity) {
        repository.findAllApps().forEach(app -> write(repository, runtimeLayout, identity, app));
    }

    public static void write(
            InstalledAppRepository repository,
            RuntimeLayout runtimeLayout,
            AutarkOsIdentity identity,
            InstalledApp app) {
        RuntimeModels.InstalledAppOwnershipMetadata ownership = repository.ownershipFor(app.appId()).orElse(null);
        if (ownership == null || !identity.instanceId().equals(ownership.autarkOsInstanceId())) {
            return;
        }
        Path appRoot = runtimeLayout.appRoot(app.appId());
        try {
            Files.createDirectories(appRoot);
            writeIfMissing(appRoot.resolve("compose.yaml"), "services: {}\n");
            writeIfMissing(appRoot.resolve("manifest.yaml"), "id: " + app.appId() + "\nversion: test\n");
            Path metadataFile = appRoot.resolve(AppRuntimeMetadataWriter.METADATA_FILE);
            if (!Files.exists(metadataFile)) {
                JSON.writerWithDefaultPrettyPrinter().writeValue(metadataFile.toFile(), Map.of(
                        "appInstanceId", ownership.appInstanceId(),
                        "catalogAppId", app.appId(),
                        "instanceId", identity.instanceId(),
                        "composeProject", app.composeProject(),
                        "manifestVersion", "test",
                        "createdAt", Instant.parse("2026-06-20T12:00:00Z").toString()));
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to create managed app test contract", exception);
        }
    }

    private static void writeIfMissing(Path path, String content) throws IOException {
        if (!Files.exists(path)) {
            Files.writeString(path, content);
        }
    }
}
