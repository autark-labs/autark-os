package com.autarkos.system;

import java.io.IOException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.backups.BackupDestinationService;
import com.autarkos.backups.BackupModels;
import com.autarkos.backups.BackupProtectionPolicy;
import com.autarkos.backups.BackupRepository;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.backups.RestorePoints;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.install.ManagedStorageContractService;
import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Service
public class StorageService {

    private static final long MINIMUM_INSTALL_FREE_BYTES = 5L * 1024L * 1024L * 1024L;
    private static final Duration WARNING_LOG_INTERVAL = Duration.ofMinutes(30);
    private static final Duration STORAGE_SAMPLE_RETENTION = Duration.ofDays(7);
    private static final Duration STORAGE_SAMPLE_INTERVAL = Duration.ofMinutes(15);
    private static final DateTimeFormatter CHECKPOINT_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final RuntimeLayout runtimeLayout;
    private final InstalledAppRepository installedAppRepository;
    private final ActivityLogService activityLogService;
    private final StorageSampleRepository storageSampleRepository;
    private final ManagedAppAttestationService managedApps;
    private final BackupRepository backupRepository;
    private final MarketplaceCatalogService catalogService;
    private final RuntimeFileOperations fileOperations;
    private final BackupDestinationService backupDestinationService;
    private final RecoveryOperationCoordinator recoveryOperations;
    private final ManagedStorageContractService storageContracts;
    private final AutarkOsFileOpsService fileOpsService;
    private Instant lastWarningLoggedAt = Instant.EPOCH;
    private Instant lastStorageSampleAt = Instant.EPOCH;
    private String lastWarningStatus = "";

    public StorageService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, ActivityLogService activityLogService, StorageSampleRepository storageSampleRepository, ManagedAppAttestationService managedApps, BackupRepository backupRepository, MarketplaceCatalogService catalogService, RuntimeFileOperations fileOperations, BackupDestinationService backupDestinationService, RecoveryOperationCoordinator recoveryOperations, ManagedStorageContractService storageContracts, AutarkOsFileOpsService fileOpsService) {
        this.runtimeLayout = runtimeLayout;
        this.installedAppRepository = installedAppRepository;
        this.activityLogService = activityLogService;
        this.storageSampleRepository = storageSampleRepository;
        this.managedApps = managedApps;
        this.backupRepository = backupRepository;
        this.catalogService = catalogService;
        this.fileOperations = fileOperations;
        this.backupDestinationService = backupDestinationService;
        this.recoveryOperations = recoveryOperations;
        this.storageContracts = storageContracts;
        this.fileOpsService = fileOpsService;
    }

    public StorageModels.StorageReport report() {
        Path runtimeRoot = runtimeLayout.runtimeRoot();
        Path appsRoot = runtimeRoot.resolve("apps").normalize();
        BackupModels.BackupDestination backupDestination = backupDestinationService.current();
        Path backupsRoot = backupDestination != null && backupDestination.ready()
                ? Path.of(backupDestination.configuredPath()).normalize()
                : runtimeRoot.resolve("backups").normalize();
        ensure(runtimeRoot);

        List<InstalledApp> installedApps = managedApps.managedApps();
        Set<String> installedIds = installedApps.stream().map(InstalledApp::appId).collect(HashSet::new, Set::add, Set::addAll);
        StorageModels.StorageUsage hostDisk = diskUsage("Host disk", runtimeRoot);
        StorageModels.StorageUsage runtimeDisk = directoryUsage("Autark-OS data", runtimeRoot, hostDisk.totalBytes(), hostDisk.usableBytes());
        StorageModels.StorageUsage backupStorage = backupDestination != null && !backupDestination.ready()
                ? new StorageModels.StorageUsage("Backup destination unavailable", backupDestination.configuredPath(), -1, -1, -1, -1)
                : backupDirectoryUsage(backupsRoot);
        List<StorageModels.AppStorageUsage> apps = installedApps.stream()
                .map(app -> appStorage(app, backupState(app.appId())))
                .sorted(Comparator.comparingLong(StorageModels.AppStorageUsage::usedBytes).reversed())
                .toList();
        recordStorageSamples(apps);
        List<StorageModels.OrphanedStorage> orphaned = orphanedStorage(appsRoot, installedIds);
        InstallStorageSafety installSafety = installSafety(hostDisk.usableBytes());
        String status = status(hostDisk.usedPercent(), orphaned.size());
        List<StorageModels.StorageRecommendation> recommendations = recommendations(status, hostDisk, backupStorage, orphaned, apps, backupDestination);
        maybeLogWarning(status, hostDisk, orphaned.size());

        return new StorageModels.StorageReport(
                status,
                headline(status),
                summary(status, hostDisk, runtimeDisk, orphaned.size()),
                hostDisk,
                runtimeDisk,
                backupStorage,
                apps,
                orphaned,
                recommendations,
                installSafety,
                backupDestination,
                Instant.now());
    }

    public StorageModels.StorageCleanupResult cleanupOrphan(String name) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.STORAGE_CLEANUP,
                () -> cleanupOrphanUnlocked(name));
    }

    private StorageModels.StorageCleanupResult cleanupOrphanUnlocked(String name) {
        String safeName = safeOrphanName(name);
        Path appsRoot = runtimeLayout.runtimeRoot().resolve("apps").toAbsolutePath().normalize();
        Path orphanPath = appsRoot.resolve(safeName).normalize();
        if (!orphanPath.startsWith(appsRoot) || !Files.isDirectory(orphanPath)) {
            throw new com.autarkos.marketplace.install.InstallationException("Autark-OS could not find that unused app data folder.");
        }
        Set<String> installedIds = managedInstalledApps().stream().map(InstalledApp::appId).collect(HashSet::new, Set::add, Set::addAll);
        if (installedIds.contains(safeName)) {
            throw new com.autarkos.marketplace.install.InstallationException("Autark-OS will not remove data for an installed app.");
        }
        ManagedStorageContractService.CleanupAssessment assessment = storageContracts.assessOrphan(orphanPath);
        if (!assessment.allowed()) {
            throw new com.autarkos.marketplace.install.InstallationException(
                    "Autark-OS will not remove this folder because its durable data placement cannot be proven. " + assessment.reason());
        }
        try {
            long removedBytes = fileOperations.directorySize(orphanPath);
            Path checkpoint = activeBackupRoot()
                    .resolve("storage-cleanup")
                    .resolve(safeName + "-before-cleanup-" + CHECKPOINT_FORMAT.format(Instant.now()) + ".zip")
                    .toAbsolutePath()
                    .normalize();
            Files.createDirectories(checkpoint.getParent());
            fileOpsService.createManagedArchive(safeName, assessment.protectedPaths(), checkpoint, activeBackupRoot());
            fileOperations.deleteRecursively(orphanPath);
            activityLogService.success(
                    "system",
                    "storage_cleanup",
                    "Removed unused app data",
                    "Removed " + safeName + " after creating a safety checkpoint.",
                    null);
            return new StorageModels.StorageCleanupResult(
                    "completed",
                    "Removed unused app data after creating a safety checkpoint.",
                    safeName,
                    orphanPath.toString(),
                    removedBytes,
                    checkpoint.toString(),
                    Instant.now());
        } catch (IOException exception) {
            activityLogService.error("system", "storage_cleanup", "Storage cleanup failed", exception.getMessage(), null, exception);
            throw new com.autarkos.marketplace.install.InstallationException("Autark-OS could not clean up that folder.", exception);
        }
    }

    private Path activeBackupRoot() {
        return backupDestinationService == null
                ? runtimeLayout.runtimeRoot().resolve("backups").toAbsolutePath().normalize()
                : backupDestinationService.activeRoot();
    }

    private StorageModels.AppStorageUsage appStorage(InstalledApp app, String backupState) {
        Path path = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        InstallModels.InstallSettings settings = installedAppRepository.settingsFor(app.appId()).orElse(null);
        long usedBytes = fileOperations.directorySize(path);
        List<StorageModels.StorageTrendPoint> trend = storageSampleRepository.forAppSince(app.appId(), Instant.now().minus(STORAGE_SAMPLE_RETENTION).toString()).stream()
                .map(sample -> new StorageModels.StorageTrendPoint(sample.usedBytes(), Instant.parse(sample.sampledAt())))
                .toList();
        long growth = trend.isEmpty() ? 0 : usedBytes - trend.getFirst().usedBytes();
        return new StorageModels.AppStorageUsage(
                app.appId(),
                app.appName(),
                app.status(),
                path.toString(),
                usedBytes,
                growth,
                trend,
                settings == null || settings.backup().enabled(),
                settings == null ? "daily" : settings.backup().frequency(),
                backupState);
    }

    private void recordStorageSamples(List<StorageModels.AppStorageUsage> apps) {
        Instant sampledAt = Instant.now();
        if (Duration.between(lastStorageSampleAt, sampledAt).compareTo(STORAGE_SAMPLE_INTERVAL) < 0) {
            return;
        }
        lastStorageSampleAt = sampledAt;
        for (StorageModels.AppStorageUsage app : apps) {
            storageSampleRepository.save(new StorageSampleEntity(app.appId(), app.usedBytes(), sampledAt.toString()));
        }
        storageSampleRepository.deleteBefore(sampledAt.minus(STORAGE_SAMPLE_RETENTION).toString());
    }

    private List<StorageModels.OrphanedStorage> orphanedStorage(Path appsRoot, Set<String> installedIds) {
        if (!Files.isDirectory(appsRoot)) {
            return List.of();
        }
        try (Stream<Path> stream = Files.list(appsRoot)) {
            List<Path> orphanPaths = stream
                    .filter(Files::isDirectory)
                    .filter(path -> !installedIds.contains(path.getFileName().toString()))
                    .toList();
            java.util.Map<Path, ManagedStorageContractService.CleanupAssessment> assessments = storageContracts.assessOrphans(orphanPaths);
            return orphanPaths.stream()
                    .map(path -> {
                        ManagedStorageContractService.CleanupAssessment assessment = assessments.get(path);
                        return new StorageModels.OrphanedStorage(
                                path.getFileName().toString(),
                                path.toAbsolutePath().normalize().toString(),
                                fileOperations.directorySize(path),
                                assessment.allowed(),
                                assessment.allowed() ? null : assessment.reason());
                    })
                    .sorted(Comparator.comparingLong(StorageModels.OrphanedStorage::usedBytes).reversed())
                    .toList();
        } catch (IOException exception) {
            return List.of();
        }
    }

    private List<InstalledApp> managedInstalledApps() {
        return managedApps.managedApps();
    }

    private String backupState(String appId) {
        InstallModels.InstallSettings settings = installedAppRepository.settingsFor(appId).orElse(null);
        return BackupProtectionPolicy.state(settings != null && settings.backup() != null && settings.backup().enabled(),
                catalogService.findById(appId).orElse(null),
                backupRepository.containingApp(appId).stream().map(RestorePoints::toDomain).toList());
    }

    private StorageModels.StorageUsage diskUsage(String label, Path path) {
        try {
            ensure(path);
            FileStore store = Files.getFileStore(path);
            long total = store.getTotalSpace();
            long usable = store.getUsableSpace();
            long used = Math.max(0, total - usable);
            return new StorageModels.StorageUsage(label, path.toAbsolutePath().normalize().toString(), total, usable, used, ratioPercent(used, total));
        } catch (IOException exception) {
            return new StorageModels.StorageUsage(label, path.toAbsolutePath().normalize().toString(), 0, 0, 0, -1);
        }
    }

    private StorageModels.StorageUsage directoryUsage(String label, Path path, long totalBytes, long usableBytes) {
        long used = fileOperations.directorySize(path);
        return new StorageModels.StorageUsage(label, path.toAbsolutePath().normalize().toString(), totalBytes, usableBytes, used, ratioPercent(used, totalBytes));
    }

    private StorageModels.StorageUsage backupDirectoryUsage(Path path) {
        StorageModels.StorageUsage disk = diskUsage("Backup filesystem", path);
        long bytes = fileOperations.measuredDirectorySize(path);
        return new StorageModels.StorageUsage("Backup files", path.toAbsolutePath().normalize().toString(),
                disk.totalBytes(), disk.usableBytes(), bytes, bytes < 0 ? -1 : ratioPercent(bytes, disk.totalBytes()));
    }

    private InstallStorageSafety installSafety(long currentFreeBytes) {
        if (currentFreeBytes < MINIMUM_INSTALL_FREE_BYTES) {
            return new InstallStorageSafety(
                    "warning",
                    "Free space is below the recommended buffer for new installs.",
                    MINIMUM_INSTALL_FREE_BYTES,
                    currentFreeBytes,
                    false);
        }
        return new InstallStorageSafety(
                "ready",
                "There is enough free space for typical app installs.",
                MINIMUM_INSTALL_FREE_BYTES,
                currentFreeBytes,
                true);
    }

    private List<StorageModels.StorageRecommendation> recommendations(
            String status,
            StorageModels.StorageUsage hostDisk,
            StorageModels.StorageUsage backupStorage,
            List<StorageModels.OrphanedStorage> orphaned,
            List<StorageModels.AppStorageUsage> apps,
            BackupModels.BackupDestination backupDestination) {
        java.util.ArrayList<StorageModels.StorageRecommendation> recommendations = new java.util.ArrayList<>();
        if ("critical".equals(status)) {
            recommendations.add(new StorageModels.StorageRecommendation("disk-critical", "danger", "Free up space soon", "The host disk is critically full. Installs, backups, and app updates may fail.", "Review largest apps"));
        } else if (hostDisk.usedPercent() >= 75) {
            recommendations.add(new StorageModels.StorageRecommendation("disk-warning", "warning", "Storage is getting tight", "Autark-OS can still run, but new installs and backups may become unreliable.", "Review storage"));
        } else {
            recommendations.add(new StorageModels.StorageRecommendation("disk-healthy", "success", "Storage looks healthy", "Autark-OS has enough free space for normal operation.", null));
        }
        if (!orphaned.isEmpty()) {
            recommendations.add(new StorageModels.StorageRecommendation("orphaned-data", "warning", "Unused app data found", "Autark-OS found folders that do not match an installed app. Review them before cleanup.", "Review unused data"));
        }
        if (backupDestination != null && !backupDestination.ready()) {
            recommendations.add(new StorageModels.StorageRecommendation("backup-destination-unavailable", "warning", "Backup drive needs attention", backupDestination.message(), "Open backups"));
        } else if (backupStorage.usedBytes() == 0) {
            recommendations.add(new StorageModels.StorageRecommendation("backups-empty", "neutral", "No backup files found", "Backup storage is empty. Run a routine or manual backup to create the first restore point.", "Open backups"));
        } else if (backupStorage.usedBytes() < 0) {
            recommendations.add(new StorageModels.StorageRecommendation("backup-size-unavailable", "warning", "Backup size is unavailable", "Autark-OS could not measure all files in the backup folder. Check the destination and folder permissions.", "Open backups"));
        }
        apps.stream().filter(app -> !app.backupEnabled()).findFirst().ifPresent(app ->
                recommendations.add(new StorageModels.StorageRecommendation("backup-disabled", "warning", "Some apps are excluded from scheduled backups", "Existing restore points are listed in Backups. Inclusion in a schedule does not mean a verified restore point exists.", "Open backups")));
        return recommendations;
    }

    private String status(double usedPercent, int orphanedCount) {
        if (usedPercent >= 90) {
            return "critical";
        }
        if (usedPercent >= 75 || orphanedCount > 0) {
            return "warning";
        }
        return "healthy";
    }

    private String headline(String status) {
        return switch (status) {
            case "critical" -> "Storage needs attention";
            case "warning" -> "Storage has a few notes";
            default -> "Storage looks healthy";
        };
    }

    private String summary(String status, StorageModels.StorageUsage hostDisk, StorageModels.StorageUsage runtimeDisk, int orphanedCount) {
        String base = "Autark-OS is using " + readableBytes(runtimeDisk.usedBytes()) + " on a host with " + readableBytes(hostDisk.usableBytes()) + " free.";
        if ("critical".equals(status)) {
            return base + " Free space is low enough that installs or backups may fail.";
        }
        if (orphanedCount > 0) {
            return base + " " + orphanedCount + " unused app data folder" + (orphanedCount == 1 ? " was" : "s were") + " found.";
        }
        return base;
    }

    private void maybeLogWarning(String status, StorageModels.StorageUsage hostDisk, int orphanedCount) {
        if ("healthy".equals(status)) {
            return;
        }
        Instant now = Instant.now();
        if (status.equals(lastWarningStatus) && Duration.between(lastWarningLoggedAt, now).compareTo(WARNING_LOG_INTERVAL) < 0) {
            return;
        }
        lastWarningStatus = status;
        lastWarningLoggedAt = now;
        activityLogService.warning(
                "system",
                "storage_check",
                "Storage needs attention",
                "Host disk usage is " + Math.round(hostDisk.usedPercent()) + "%. Orphaned app data folders: " + orphanedCount + ".",
                null);
    }

    private void ensure(Path path) {
        try {
            Files.createDirectories(path);
        } catch (IOException ignored) {
            // The report will surface missing or unreadable paths as zero-sized entries.
        }
    }

    private String safeOrphanName(String name) {
        if (name == null || !name.matches("[a-z0-9][a-z0-9-]{1,63}")) {
            throw new com.autarkos.marketplace.install.InstallationException("Cleanup target must be a safe app-folder name.");
        }
        return name;
    }

    private double ratioPercent(long used, long total) {
        if (total <= 0) {
            return -1;
        }
        return Math.round(((double) used / (double) total) * 10_000.0) / 100.0;
    }

    private String readableBytes(long value) {
        if (value <= 0) {
            return "0 B";
        }
        String[] units = {"B", "KB", "MB", "GB", "TB"};
        double size = value;
        int unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
            size /= 1024;
            unit++;
        }
        return (size >= 10 || unit == 0 ? String.format("%.0f", size) : String.format("%.1f", size)) + " " + units[unit];
    }
}
