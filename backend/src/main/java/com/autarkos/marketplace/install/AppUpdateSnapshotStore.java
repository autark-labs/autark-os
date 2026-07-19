package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Component;

/** Keeps a private, file-backed release checkpoint separate from normal app data. */
@Component
public class AppUpdateSnapshotStore {

    static final String SNAPSHOT_ROOT = ".autark-os-update-snapshots";
    private static final String COMPOSE_FILE = "compose.yaml";
    private static final String MANIFEST_FILE = "manifest.yaml";
    private static final String METADATA_FILE = AppRuntimeMetadataWriter.METADATA_FILE;

    private final AppUpdateSnapshotRepository repository;

    public AppUpdateSnapshotStore(AppUpdateSnapshotRepository repository) {
        this.repository = repository;
    }

    public AppUpdateSnapshot create(
            InstalledApp app,
            String operationKind,
            String fromVersion,
            String toVersion,
            Long safetyRestorePointId,
            String composeContents) {
        Path appRoot = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        Path compose = appRoot.resolve(COMPOSE_FILE);
        Path manifest = appRoot.resolve(MANIFEST_FILE);
        Path metadata = appRoot.resolve(METADATA_FILE);
        requireRegular(compose, "Compose");
        requireRegular(manifest, "runtime manifest");
        requireRegular(metadata, "runtime metadata");

        String snapshotId = "update_" + UUID.randomUUID().toString().replace("-", "");
        Path directory = appRoot.resolve(SNAPSHOT_ROOT).resolve(snapshotId).normalize();
        if (!directory.startsWith(appRoot)) {
            throw new InstallationException("Autark-OS could not create a safe update snapshot path.");
        }
        try {
            Files.createDirectories(directory);
            if (composeContents == null || composeContents.isBlank()) {
                copy(compose, directory.resolve(COMPOSE_FILE));
            } else {
                Files.writeString(directory.resolve(COMPOSE_FILE), composeContents);
            }
            copy(manifest, directory.resolve(MANIFEST_FILE));
            copy(metadata, directory.resolve(METADATA_FILE));
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not save the current app release before changing it.", exception);
        }

        Instant now = Instant.now();
        return repository.saveSnapshot(new AppUpdateSnapshot(
                snapshotId,
                app.appId(),
                app.appName(),
                operationKind,
                safeVersion(fromVersion),
                safeVersion(toVersion),
                directory.toString(),
                safetyRestorePointId,
                "applying",
                "Release checkpoint saved.",
                now,
                now));
    }

    public AppUpdateSnapshot create(
            InstalledApp app,
            String operationKind,
            String fromVersion,
            String toVersion,
            Long safetyRestorePointId) {
        return create(app, operationKind, fromVersion, toVersion, safetyRestorePointId, null);
    }

    public void restore(AppUpdateSnapshot snapshot, InstalledApp app) {
        Path appRoot = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        Path directory = Path.of(snapshot.snapshotPath()).toAbsolutePath().normalize();
        Path expectedRoot = appRoot.resolve(SNAPSHOT_ROOT).normalize();
        if (!directory.startsWith(expectedRoot)) {
            throw new InstallationException("Autark-OS refused an update snapshot outside this app's protected runtime folder.");
        }
        try {
            copy(directory.resolve(COMPOSE_FILE), appRoot.resolve(COMPOSE_FILE));
            copy(directory.resolve(MANIFEST_FILE), appRoot.resolve(MANIFEST_FILE));
            copy(directory.resolve(METADATA_FILE), appRoot.resolve(METADATA_FILE));
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not restore the saved app release.", exception);
        }
    }

    public void updateStatus(AppUpdateSnapshot snapshot, String status, String message) {
        repository.updateStatus(snapshot.snapshotId(), status, message);
    }

    public java.util.Optional<AppUpdateSnapshot> latestRollbackFor(String appId) {
        return repository.latestRollbackFor(appId);
    }

    public java.util.Optional<AppUpdateSnapshot> activeFor(String appId) {
        return repository.activeFor(appId);
    }

    private void copy(Path source, Path target) throws IOException {
        requireRegular(source, source.getFileName().toString());
        Files.createDirectories(target.getParent());
        Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.COPY_ATTRIBUTES);
    }

    private void requireRegular(Path path, String label) {
        if (!Files.isRegularFile(path)) {
            throw new InstallationException("The app's " + label + " is missing, so Autark-OS cannot create a reversible update.");
        }
    }

    private String safeVersion(String version) {
        return version == null || version.isBlank() ? "unknown" : version.trim();
    }
}
