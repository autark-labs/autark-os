package com.projectos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.system.InstanceIdentityService;
import com.projectos.system.ProjectOsIdentity;

@Component
public class AppRuntimeMetadataWriter {

    public static final String METADATA_FILE = "project-os-app.json";

    private final Supplier<ProjectOsIdentity> identitySupplier;
    private final Supplier<Instant> clock;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public AppRuntimeMetadataWriter(InstanceIdentityService identityService) {
        this(identityService::current, Instant::now);
    }

    public AppRuntimeMetadataWriter(Supplier<ProjectOsIdentity> identitySupplier, Supplier<Instant> clock) {
        this.identitySupplier = identitySupplier;
        this.clock = clock;
    }

    public AppRuntimeMetadata write(ApplicationManifest manifest, Path appRoot, String appInstanceId, String composeProject) {
        ProjectOsIdentity identity = identitySupplier.get();
        AppRuntimeMetadata metadata = new AppRuntimeMetadata(
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

        private static StoredMetadata from(AppRuntimeMetadata metadata) {
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
