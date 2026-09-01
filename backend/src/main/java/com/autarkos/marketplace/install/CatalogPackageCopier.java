package com.autarkos.marketplace.install;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.RuntimeProvisionedFile;

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

    /**
     * Materializes catalog-owned defaults only when a user has not already created the target.
     * Reinstall and update paths therefore preserve local configuration rather than replacing it
     * with the catalog default.
     */
    public void copyProvisionedFiles(ApplicationManifest manifest, Path appRoot) {
        for (RuntimeProvisionedFile file : manifest.runtime().provisionedFiles()) {
            Path target = appRoot.resolve(file.target()).normalize();
            if (!target.startsWith(appRoot)) {
                throw new InstallationException("Catalog file target escapes the managed runtime folder for " + manifest.name());
            }
            if (Files.exists(target)) {
                continue;
            }
            ClassPathResource resource = new ClassPathResource("catalog/apps/" + manifest.id() + "/" + file.source());
            try (InputStream input = resource.getInputStream()) {
                Files.createDirectories(target.getParent());
                Files.copy(input, target);
            } catch (IOException exception) {
                throw new InstallationException("Unable to provision " + file.target() + " for " + manifest.name(), exception);
            }
        }
    }
}
