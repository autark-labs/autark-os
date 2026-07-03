package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.model.ApplicationManifest;

@Component
public class CatalogPackageCopier {

    public void copyManifest(ApplicationManifest manifest, Path appRoot) {
        ClassPathResource resource = new ClassPathResource("catalog/apps/" + manifest.id() + "/manifest.yaml");
        try {
            Files.copy(resource.getInputStream(), appRoot.resolve("manifest.yaml"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException exception) {
            throw new InstallationException("Unable to copy manifest for " + manifest.name(), exception);
        }
    }
}
