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

    private final BackupRepository backupRepository;
    private final InstalledAppRepository installedAppRepository;
    private final BackupContractService backupContractService;
    private final ActivityLogService activityLogService;

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
            RestorePoint updated = updateVerification(point.id(), AutarkOsStates.RestorePointStatus.FAILED, "Only completed backups can be verified.", "", "low");
            return new VerificationUpdate(updated, result(updated));
        }
        try {
            Path path = Path.of(point.path());
            if (!Files.isRegularFile(path)) {
                RestorePoint updated = updateVerification(point.id(), AutarkOsStates.RestorePointStatus.FAILED, "Backup file is missing.", "", "low");
                return new VerificationUpdate(updated, result(updated));
            }
            ZipSummary summary = inspectZip(path);
            if (summary.entries() == 0 || summary.bytes() <= 0) {
                RestorePoint updated = updateVerification(point.id(), AutarkOsStates.RestorePointStatus.FAILED, "Backup archive is empty.", "", "low");
                return new VerificationUpdate(updated, result(updated));
            }
            String checksum = checksum(path);
            RestorePoint updated = updateVerification(
                    point.id(),
                    AutarkOsStates.RestorePointStatus.VERIFIED,
                    "Verified " + summary.entries() + " file(s) and " + summary.bytes() + " byte(s) inside the archive.",
                    checksum,
                    confidenceFor(point));
            activityLogService.success("backup", "backup_verified", "Backup verified", updated.appName() + " restore point is readable.", null);
            return new VerificationUpdate(updated, result(updated));
        } catch (RuntimeException | IOException exception) {
            RestorePoint updated = updateVerification(point.id(), AutarkOsStates.RestorePointStatus.FAILED, userMessage(exception), "", "low");
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

    private RestorePoint updateVerification(long id, String verificationStatus, String verificationMessage, String checksumSha256, String restoreConfidence) {
        RestorePointEntity entity = backupRepository.findById(id)
                .orElseThrow(() -> new InstallationException("Restore point was not found."));
        entity.updateVerification(
                RestorePoints.clean(verificationStatus, "not_checked"),
                RestorePoints.clean(verificationMessage, "Backup verification has not run."),
                checksumSha256 == null ? "" : checksumSha256,
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
                    entries++;
                    int read;
                    while ((read = zip.read(buffer)) >= 0) {
                        bytes += read;
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

    record VerificationUpdate(RestorePoint restorePoint, BackupModels.BackupVerificationResult result) {
    }
}
