package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.system.AutarkOsIdentity;
import com.autarkos.system.InstanceIdentityService;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class AppRuntimeMetadataWriter {

    public static final String METADATA_FILE = "autark-os-app.json";

    private final Supplier<AutarkOsIdentity> identitySupplier;
    private final Supplier<Instant> clock;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public AppRuntimeMetadataWriter(InstanceIdentityService identityService) {
        this(identityService::current, Instant::now);
    }

    public AppRuntimeMetadataWriter(Supplier<AutarkOsIdentity> identitySupplier, Supplier<Instant> clock) {
        this.identitySupplier = identitySupplier;
        this.clock = clock;
    }

    public RuntimeModels.AppRuntimeMetadata write(ApplicationManifest manifest, Path appRoot, String appInstanceId, String composeProject) {
        AutarkOsIdentity identity = identitySupplier.get();
        RuntimeModels.AppRuntimeMetadata metadata = new RuntimeModels.AppRuntimeMetadata(
                appInstanceId,
                manifest.id(),
                identity.instanceId(),
                composeProject,
                manifest.version(),
                clock.get());
        try {
            Files.createDirectories(appRoot);
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(appRoot.resolve(METADATA_FILE).toFile(), StoredMetadata.from(metadata));
            return metadata;
        } catch (IOException exception) {
            throw new InstallationException("Unable to write Autark-OS runtime metadata for " + manifest.name(), exception);
        }
    }

    private record StoredMetadata(
            String appInstanceId,
            String catalogAppId,
            String instanceId,
            String composeProject,
            String manifestVersion,
            String createdAt) {

        private static StoredMetadata from(RuntimeModels.AppRuntimeMetadata metadata) {
            return new StoredMetadata(
                    metadata.appInstanceId(),
                    metadata.catalogAppId(),
                    metadata.instanceId(),
                    metadata.composeProject(),
                    metadata.manifestVersion(),
                    metadata.createdAt().toString());
        }
    }
}
