package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;

class BackupVerificationService {

    private static final long MAX_ARCHIVE_ENTRIES = 100_000;
    private static final long MAX_UNCOMPRESSED_ARCHIVE_BYTES = 64L * 1024L * 1024L * 1024L;

    private final BackupRepository backupRepository;
    private final InstalledAppRepository installedAppRepository;
    private final BackupContractService backupContractService;
    private final ActivityLogService activityLogService;
    private final BackupArchiveManifestService archiveManifestService = new BackupArchiveManifestService();

    BackupVerificationService(
            BackupRepository backupRepository,
            InstalledAppRepository installedAppRepository,
            BackupContractService backupContractService,
            ActivityLogService activityLogService) {
        this.backupRepository = backupRepository;
        this.installedAppRepository = installedAppRepository;
        this.backupContractService = backupContractService;
        this.activityLogService = activityLogService;
    }

    VerificationUpdate verifyRestorePoint(RestorePoint point) {
        if (!AutarkOsStates.RestorePointStatus.COMPLETED.equals(point.status())) {
            RestorePoint updated = updateVerification(point.id(), AutarkOsStates.RestorePointStatus.FAILED, "Only completed backups can be verified.", "low");
            return new VerificationUpdate(updated, result(updated));
        }
        if (!hasImmutableBaseline(point)) {
            RestorePoint updated = updateVerification(point.id(), "legacy_unverified", "This restore point was created before Autark-OS recorded an immutable integrity baseline. Create a new backup before restoring.", "unknown");
            return new VerificationUpdate(updated, result(updated));
        }
        try {
            Path path = Path.of(point.path());
            if (!Files.isRegularFile(path)) {
                RestorePoint updated = updateVerification(point.id(), AutarkOsStates.RestorePointStatus.FAILED, "Backup file is missing.", "low");
                return new VerificationUpdate(updated, result(updated));
            }
            ZipSummary summary = inspectZip(path);
            if (summary.entries() == 0 || summary.bytes() <= 0) {
                RestorePoint updated = updateVerification(point.id(), AutarkOsStates.RestorePointStatus.FAILED, "Backup archive is empty.", "low");
                return new VerificationUpdate(updated, result(updated));
            }
            String checksum = checksum(path);
            if (!point.integrityBaselineSha256().equals(checksum)) {
                RestorePoint updated = updateVerification(point.id(), AutarkOsStates.RestorePointStatus.FAILED, "Backup archive checksum no longer matches the immutable creation-time baseline.", "low");
                return new VerificationUpdate(updated, result(updated));
            }
            archiveManifestService.validate(path, point);
            RestorePoint updated = updateVerification(
                    point.id(),
                    AutarkOsStates.RestorePointStatus.VERIFIED,
                    "Verified " + summary.entries() + " file(s) and " + summary.bytes() + " byte(s) inside the archive.",
                    confidenceFor(point));
            activityLogService.success("backup", "backup_verified", "Backup verified", updated.appName() + " restore point is readable.", null);
            return new VerificationUpdate(updated, result(updated));
        } catch (RuntimeException | IOException exception) {
            RestorePoint updated = updateVerification(point.id(), AutarkOsStates.RestorePointStatus.FAILED, userMessage(exception), "low");
            RuntimeException logged = exception instanceof RuntimeException runtimeException ? runtimeException : new InstallationException(userMessage(exception), exception);
            activityLogService.error("backup", "backup_verification_failed", "Backup verification failed", userMessage(exception), point.appId(), logged);
            return new VerificationUpdate(updated, result(updated));
        }
    }

    BackupModels.BackupVerificationResult result(RestorePoint point) {
        return new BackupModels.BackupVerificationResult(point.id(), point.verificationStatus(), point.verificationMessage(), point.checksumSha256(), point.restoreConfidence(), point.verifiedAt());
    }

    String restoreConfidence(RestorePoint point, List<InstalledApp> affected) {
        if (AutarkOsStates.RestorePointStatus.FAILED.equals(point.verificationStatus())) {
            return "Low";
        }
        if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus())) {
            return "Unknown";
        }
        boolean reviewRequired = affected.stream().map(backupContractService::backupContract).anyMatch(BackupModels.BackupContract::reviewRequired);
        return reviewRequired ? "Medium" : "High";
    }

    IntegrityCheck restoreIntegrity(RestorePoint point) {
        if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus())) {
            return IntegrityCheck.blocked("This restore point has not passed verification.");
        }
        if (!hasImmutableBaseline(point)) {
            return IntegrityCheck.blocked("This restore point does not have an immutable integrity baseline.");
        }
        try {
            Path archive = Path.of(point.path());
            if (!Files.isRegularFile(archive)) {
                return IntegrityCheck.blocked("Backup file is missing.");
            }
            ZipSummary summary = inspectZip(archive);
            if (summary.entries() == 0 || summary.bytes() <= 0) {
                return IntegrityCheck.blocked("Backup archive is empty.");
            }
            if (!point.integrityBaselineSha256().equals(checksum(archive))) {
                return IntegrityCheck.blocked("Backup archive checksum no longer matches the immutable creation-time baseline.");
            }
            archiveManifestService.validate(archive, point);
            return IntegrityCheck.ready();
        } catch (RuntimeException | IOException exception) {
            return IntegrityCheck.blocked(userMessage(exception));
        }
    }

    String captureIntegrityBaseline(Path archive) throws IOException {
        return checksum(archive);
    }

    void writeArchiveManifest(Path archive, String checksumSha256, String appId, String appName, String scope, String source, String includedAppIds, BackupModels.BackupContract contract) throws IOException {
        writeArchiveManifest(archive, checksumSha256, appId, appName, scope, source, includedAppIds, contract, "not recorded for this safety checkpoint");
    }

    void writeArchiveManifest(Path archive, String checksumSha256, String appId, String appName, String scope, String source, String includedAppIds, BackupModels.BackupContract contract, String appImageIdentity) throws IOException {
        archiveManifestService.write(archive, checksumSha256, appId, appName, scope, source, includedAppIds, contract, appImageIdentity);
    }

    private String confidenceFor(RestorePoint point) {
        if ("full".equals(point.scope()) && point.includedAppIds() != null && point.includedAppIds().contains(",")) {
            boolean reviewRequired = java.util.Arrays.stream(point.includedAppIds().split(","))
                    .map(String::trim)
                    .filter(value -> !value.isBlank())
                    .map(installedAppRepository::findAppById)
                    .flatMap(Optional::stream)
                    .map(backupContractService::backupContract)
                    .anyMatch(BackupModels.BackupContract::reviewRequired);
            return reviewRequired ? "medium" : "high";
        }
        return installedAppRepository.findAppById(point.appId())
                .map(backupContractService::backupContract)
                .filter(BackupModels.BackupContract::reviewRequired)
                .isPresent() ? "medium" : "high";
    }

    private RestorePoint updateVerification(long id, String verificationStatus, String verificationMessage, String restoreConfidence) {
        RestorePointEntity entity = backupRepository.findById(id)
                .orElseThrow(() -> new InstallationException("Restore point was not found."));
        entity.updateVerification(
                RestorePoints.clean(verificationStatus, "not_checked"),
                RestorePoints.clean(verificationMessage, "Backup verification has not run."),
                RestorePoints.clean(restoreConfidence, "unknown"),
                Instant.now().toString());
        return RestorePoints.toDomain(backupRepository.save(entity));
    }

    private ZipSummary inspectZip(Path path) throws IOException {
        long entries = 0;
        long bytes = 0;
        byte[] buffer = new byte[8192];
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(path))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!entry.isDirectory()) {
                    if (entry.getName().startsWith("/") || entry.getName().contains("..\\") || entry.getName().contains("../")) {
                        throw new InstallationException("Backup archive contains an unsafe file path.");
                    }
                    entries++;
                    if (entries > MAX_ARCHIVE_ENTRIES) {
                        throw new InstallationException("Backup archive has too many files to verify safely.");
                    }
                    int read;
                    while ((read = zip.read(buffer)) >= 0) {
                        bytes += read;
                        if (bytes > MAX_UNCOMPRESSED_ARCHIVE_BYTES) {
                            throw new InstallationException("Backup archive expands beyond the safe verification limit.");
                        }
                    }
                }
                zip.closeEntry();
            }
        }
        return new ZipSummary(entries, bytes);
    }

    private String checksum(Path path) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (DigestInputStream input = new DigestInputStream(Files.newInputStream(path), digest)) {
                input.transferTo(java.io.OutputStream.nullOutputStream());
            }
            StringBuilder builder = new StringBuilder();
            for (byte value : digest.digest()) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new InstallationException("This Java runtime cannot calculate SHA-256 checksums.", exception);
        }
    }

    private String userMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Backup failed."
                : exception.getMessage();
    }

    private record ZipSummary(long entries, long bytes) {
    }

    private boolean hasImmutableBaseline(RestorePoint point) {
        return point.integrityBaselineSha256() != null && point.integrityBaselineSha256().matches("[a-f0-9]{64}")
                && point.backupContractVersion() >= 1
                && point.backupContractStrategy() != null
                && !point.backupContractStrategy().isBlank()
                && !"legacy_unverified".equals(point.backupContractStrategy());
    }

    record IntegrityCheck(boolean restorable, String message) {
        static IntegrityCheck ready() {
            return new IntegrityCheck(true, "Backup archive matches its immutable integrity baseline.");
        }

        static IntegrityCheck blocked(String message) {
            return new IntegrityCheck(false, message);
        }
    }

    record VerificationUpdate(RestorePoint restorePoint, BackupModels.BackupVerificationResult result) {
    }
}
