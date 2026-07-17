package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.autarkos.marketplace.install.InstallationException;

/**
 * Stores immutable, human-readable backup metadata beside a ZIP archive. The
 * database holds the authority checksum; this file lets a copied archive carry
 * enough context to be reviewed without guessing from directory names.
 */
final class BackupArchiveManifestService {

    private static final int SCHEMA_VERSION = 1;
    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    Path manifestPath(Path archive) {
        return archive.resolveSibling(archive.getFileName() + ".manifest.json");
    }

    void write(Path archive, String checksumSha256, String appId, String appName, String scope, String source, String includedAppIds, BackupModels.BackupContract contract, String appImageIdentity) throws IOException {
        Path destination = manifestPath(archive);
        Files.createDirectories(destination.getParent());
        Path temporary = Files.createTempFile(destination.getParent(), ".autark-os-backup-", ".json");
        ArchiveManifest manifest = new ArchiveManifest(
                SCHEMA_VERSION,
                archive.getFileName().toString(),
                checksumSha256,
                appId,
                appName,
                scope,
                source,
                includedAppIds,
                appImageIdentity,
                contract.strategy(),
                contract.version(),
                "zip",
                Instant.now());
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(temporary.toFile(), manifest);
            try {
                Files.move(temporary, destination, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException exception) {
                Files.move(temporary, destination, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    void validate(Path archive, RestorePoint point) throws IOException {
        Path manifestPath = manifestPath(archive);
        if (!Files.isRegularFile(manifestPath)) {
            throw new InstallationException("Backup manifest is missing. Create a new restore point before restoring.");
        }
        ArchiveManifest manifest = objectMapper.readValue(manifestPath.toFile(), ArchiveManifest.class);
        if (manifest.schemaVersion() != SCHEMA_VERSION) {
            throw new InstallationException("Backup manifest uses an unsupported format.");
        }
        if (!archive.getFileName().toString().equals(manifest.archiveFileName())
                || !same(point.integrityBaselineSha256(), manifest.archiveSha256())
                || !same(point.appId(), manifest.appId())
                || !same(point.scope(), manifest.scope())
                || !same(point.includedAppIds(), manifest.includedAppIds())
                || !same(point.backupContractStrategy(), manifest.backupContractStrategy())
                || point.backupContractVersion() != manifest.backupContractVersion()) {
            throw new InstallationException("Backup manifest does not match the recorded restore point.");
        }
    }

    private boolean same(String first, String second) {
        return first != null && first.equals(second == null ? "" : second);
    }

    private record ArchiveManifest(
            int schemaVersion,
            String archiveFileName,
            String archiveSha256,
            String appId,
            String appName,
            String scope,
            String source,
            String includedAppIds,
            String appImageIdentity,
            String backupContractStrategy,
            int backupContractVersion,
            String archiveFormat,
            Instant createdAt) {
    }
}
