package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.stereotype.Component;

import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Component
public class RuntimeDirectoryManager {

    private final RuntimeLayout runtimeLayout;

    public RuntimeDirectoryManager(RuntimeLayout runtimeLayout) {
        this.runtimeLayout = runtimeLayout;
    }

    public Path prepare(ApplicationManifest manifest) {
        Path appRoot = runtimeLayout.appRoot(manifest.id());
        try {
            Files.createDirectories(appRoot);
            Files.createDirectories(appRoot.resolve("config"));
            Files.createDirectories(appRoot.resolve("logs"));
            for (String backupPath : manifest.runtime().backupPaths()) {
                Files.createDirectories(appRoot.resolve(backupPath));
            }
            return appRoot;
        } catch (IOException exception) {
            throw new InstallationException("Unable to create runtime directories for " + manifest.name(), exception);
        }
    }
}
