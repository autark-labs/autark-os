package com.projectos.system;

import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.projectos.marketplace.runtime.RuntimeLayout;

@Service
public class InstanceIdentityService {

    private static final int CURRENT_SCHEMA_VERSION = 1;

    private final RuntimeLayout runtimeLayout;
    private final Supplier<String> hostNameSupplier;
    private final Supplier<String> idSupplier;
    private final Supplier<Instant> clock;
    private final ObjectMapper objectMapper;

    @Autowired
    public InstanceIdentityService(RuntimeLayout runtimeLayout) {
        this(runtimeLayout, InstanceIdentityService::hostName, InstanceIdentityService::newInstanceId, Instant::now);
    }

    InstanceIdentityService(
            RuntimeLayout runtimeLayout,
            Supplier<String> hostNameSupplier,
            Supplier<String> idSupplier,
            Supplier<Instant> clock) {
        this.runtimeLayout = runtimeLayout;
        this.hostNameSupplier = hostNameSupplier;
        this.idSupplier = idSupplier;
        this.clock = clock;
        this.objectMapper = new ObjectMapper();
    }

    public ProjectOsIdentity current() {
        if (Files.exists(runtimeLayout.identityPath())) {
            return readExisting();
        }
        return create();
    }

    private ProjectOsIdentity readExisting() {
        try {
            StoredIdentity storedIdentity = objectMapper.readValue(runtimeLayout.identityPath().toFile(), StoredIdentity.class);
            ProjectOsIdentity identity = storedIdentity.toIdentity();
            validate(identity);
            return identity;
        } catch (IOException | RuntimeException exception) {
            throw new IllegalStateException("Autark-OS identity file is unreadable at " + runtimeLayout.identityPath(), exception);
        }
    }

    private ProjectOsIdentity create() {
        ProjectOsIdentity identity = new ProjectOsIdentity(
                idSupplier.get(),
                slug(hostNameSupplier.get()),
                runtimeLayout.runtimeRoot().toString(),
                runtimeRootHash(runtimeLayout.runtimeRoot().toString()),
                clock.get(),
                CURRENT_SCHEMA_VERSION);
        try {
            Files.createDirectories(runtimeLayout.configRoot());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(runtimeLayout.identityPath().toFile(), StoredIdentity.from(identity));
            return identity;
        } catch (IOException exception) {
            throw new IllegalStateException("Autark-OS identity file could not be created at " + runtimeLayout.identityPath(), exception);
        }
    }

    private void validate(ProjectOsIdentity identity) {
        if (identity == null
                || identity.schemaVersion() != CURRENT_SCHEMA_VERSION
                || isBlank(identity.instanceId())
                || isBlank(identity.instanceSlug())
                || isBlank(identity.runtimeRoot())
                || isBlank(identity.runtimeRootHash())
                || identity.createdAt() == null) {
            throw new IllegalStateException("Autark-OS identity file is incomplete.");
        }
    }

    private static String newInstanceId() {
        return "pos_" + UUID.randomUUID().toString().replace("-", "");
    }

    private static String hostName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (IOException exception) {
            return "project-os";
        }
    }

    private static String slug(String value) {
        if (value == null || value.isBlank()) {
            return "project-os";
        }
        String slug = value.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+|-+$)", "");
        return slug.isBlank() ? "project-os" : slug;
    }

    public static String runtimeRootHash(String runtimeRoot) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(runtimeRoot.getBytes(StandardCharsets.UTF_8));
            return "sha256:" + HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private record StoredIdentity(
            String instanceId,
            String instanceSlug,
            String runtimeRoot,
            String runtimeRootHash,
            String createdAt,
            int schemaVersion) {

        private static StoredIdentity from(ProjectOsIdentity identity) {
            return new StoredIdentity(
                    identity.instanceId(),
                    identity.instanceSlug(),
                    identity.runtimeRoot(),
                    identity.runtimeRootHash(),
                    identity.createdAt().toString(),
                    identity.schemaVersion());
        }

        private ProjectOsIdentity toIdentity() {
            return new ProjectOsIdentity(
                    instanceId,
                    instanceSlug,
                    runtimeRoot,
                    runtimeRootHash,
                    Instant.parse(createdAt),
                    schemaVersion);
        }
    }
}
