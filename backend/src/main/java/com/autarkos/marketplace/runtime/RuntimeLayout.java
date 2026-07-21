package com.autarkos.marketplace.runtime;

import java.nio.file.Path;

import org.springframework.stereotype.Component;

@Component
public class RuntimeLayout {

    private final AutarkOsRuntimeProperties properties;

    public RuntimeLayout(AutarkOsRuntimeProperties properties) {
        this.properties = properties;
    }

    public Path runtimeRoot() {
        return Path.of(properties.getRuntimeRoot()).toAbsolutePath().normalize();
    }

    public Path appRoot(String appId) {
        return runtimeRoot().resolve("apps").resolve(appId).normalize();
    }

    public Path databasePath() {
        return runtimeRoot().resolve("autark-os.db").normalize();
    }

    public Path configRoot() {
        return runtimeRoot().resolve("config").normalize();
    }

    public Path identityPath() {
        return configRoot().resolve("identity.json").normalize();
    }

    public Path proConfigRoot() {
        return configRoot().resolve("pro").normalize();
    }

    public Path proDeviceIdentityPath() {
        return proConfigRoot().resolve("device-identity.json").normalize();
    }

    public Path proAgentRoot() {
        return runtimeRoot().resolve("pro-agent").normalize();
    }

    public Path proAgentSecretRoot() {
        return proAgentRoot().resolve("secrets").normalize();
    }

    public Path proAgentApiCredentialPath() {
        return proAgentSecretRoot()
                .resolve("agent-api-token")
                .normalize();
    }

    public Path proRegistryPullRoot() {
        return proAgentRoot()
                .resolve("registry-pulls")
                .normalize();
    }

    public String appPath(String appId, String relativePath) {
        return appRoot(appId).resolve(relativePath).normalize().toString();
    }
}
