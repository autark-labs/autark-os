package com.projectos.marketplace.runtime;

import java.nio.file.Path;

import org.springframework.stereotype.Component;

@Component
public class RuntimeLayout {

    private final ProjectOsRuntimeProperties properties;

    public RuntimeLayout(ProjectOsRuntimeProperties properties) {
        this.properties = properties;
    }

    public Path runtimeRoot() {
        return Path.of(properties.getRuntimeRoot()).toAbsolutePath().normalize();
    }

    public Path appRoot(String appId) {
        return runtimeRoot().resolve("apps").resolve(appId).normalize();
    }

    public Path databasePath() {
        return runtimeRoot().resolve("project-os.db").normalize();
    }

    public String appPath(String appId, String relativePath) {
        return appRoot(appId).resolve(relativePath).normalize().toString();
    }
}
