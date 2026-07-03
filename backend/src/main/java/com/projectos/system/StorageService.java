package com.projectos.system;

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

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.projectos.activity.ActivityLogService;
import com.projectos.marketplace.install.AppInstanceView;
import com.projectos.marketplace.install.AppInstanceViewProvider;
import com.projectos.marketplace.install.AppRemediationView;
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.runtime.RuntimeLayout;
@Service
public class StorageService {

    private static final long MINIMUM_INSTALL_FREE_BYTES = 5L * 1024L * 1024L * 1024L;
    private static final Duration WARNING_LOG_INTERVAL = Duration.ofMinutes(30);
    private static final Duration STORAGE_SAMPLE_RETENTION = Duration.ofDays(7);
    private static final DateTimeFormatter CHECKPOINT_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final RuntimeLayout runtimeLayout;
    private final InstalledAppRepository installedAppRepository;
    private final ActivityLogService activityLogService;
    private final StorageSampleRepository storageSampleRepository;
    private final AppInstanceViewProvider appInstanceViewProvider;
    private final RuntimeFileOperations fileOperations;
    private Instant lastWarningLoggedAt = Instant.EPOCH;
    private String lastWarningStatus = "";

    public StorageService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, ActivityLogService activityLogService, StorageSampleRepository storageSampleRepository) {
        this(runtimeLayout, installedAppRepository, activityLogService, storageSampleRepository, new RuntimeFileOperations());
    }

    public StorageService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, ActivityLogService activityLogService, StorageSampleRepository storageSampleRepository, RuntimeFileOperations fileOperations) {
        this(runtimeLayout, installedAppRepository, activityLogService, storageSampleRepository, () -> installedAppRepository.findAll().stream()
                .map(app -> new AppInstanceView(
                        app.appId(),
                        app.appId(),
                        app.appName(),
                        "",
                        "",
                        app.status(),
                        app.status(),
                        app.status(),
                        "owned",
                        app.accessUrl() == null || app.accessUrl().isBlank() ? "not_ready" : "local_ready",
                        "backup_disabled",
                        app.accessUrl(),
                        null,
                        List.of(),
                        List.of(),
                        new AppRemediationView("watching", "Autark-OS is watching", app.appName() + " is ready. If it drifts, Autark-OS will try safe repair before asking you to intervene.", "No action needed", "success"),
                        Instant.now()))
                .toList(), fileOperations);
    }

    @Autowired
    public StorageService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, ActivityLogService activityLogService, StorageSampleRepository storageSampleRepository, AppInstanceViewProvider appInstanceViewProvider, RuntimeFileOperations fileOperations) {
        this.runtimeLayout = runtimeLayout;
        this.installedAppRepository = installedAppRepository;
        this.activityLogService = activityLogService;
        this.storageSampleRepository = storageSampleRepository;
        this.appInstanceViewProvider = appInstanceViewProvider;
        this.fileOperations = fileOperations;
    }

    public StorageReport report() {
        Path runtimeRoot = runtimeLayout.runtimeRoot();
        Path appsRoot = runtimeRoot.resolve("apps").normalize();
        Path backupsRoot = runtimeRoot.resolve("backups").normalize();
        ensure(runtimeRoot);

        List<InstalledApp> installedApps = managedInstalledApps();
        Set<String> installedIds = installedApps.stream().map(InstalledApp::appId).collect(HashSet::new, Set::add, Set::addAll);
        StorageUsage hostDisk = diskUsage("Host disk", runtimeRoot);
        StorageUsage runtimeDisk = directoryUsage("Autark-OS data", runtimeRoot, hostDisk.totalBytes(), hostDisk.usableBytes());
        StorageUsage backupStorage = directoryUsage("Backups", backupsRoot, hostDisk.totalBytes(), hostDisk.usableBytes());
        List<AppStorageUsage> apps = installedApps.stream()
                .map(this::appStorage)
                .sorted(Comparator.comparingLong(AppStorageUsage::usedBytes).reversed())
                .toList();
        recordStorageSamples(apps);
        List<OrphanedStorage> orphaned = orphanedStorage(appsRoot, installedIds);
        InstallStorageSafety installSafety = installSafety(hostDisk.usableBytes());
        String status = status(hostDisk.usedPercent(), orphaned.size());
        List<StorageRecommendation> recommendations = recommendations(status, hostDisk, backupStorage, orphaned, apps);
        maybeLogWarning(status, hostDisk, orphaned.size());

        return new StorageReport(
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
                Instant.now());
    }

    public StorageCleanupResult cleanupOrphan(String name) {
        String safeName = safeOrphanName(name);
        Path appsRoot = runtimeLayout.runtimeRoot().resolve("apps").toAbsolutePath().normalize();
        Path orphanPath = appsRoot.resolve(safeName).normalize();
        if (!orphanPath.startsWith(appsRoot) || !Files.isDirectory(orphanPath)) {
            throw new com.projectos.marketplace.install.InstallationException("Autark-OS could not find that unused app data folder.");
        }
        Set<String> installedIds = managedInstalledApps().stream().map(InstalledApp::appId).collect(HashSet::new, Set::add, Set::addAll);
        if (installedIds.contains(safeName)) {
            throw new com.projectos.marketplace.install.InstallationException("Autark-OS will not remove data for an installed app.");
        }
        try {
            long removedBytes = fileOperations.directorySize(orphanPath);
            Path checkpoint = runtimeLayout.runtimeRoot()
                    .resolve("backups")
                    .resolve("storage-cleanup")
                    .resolve(safeName + "-before-cleanup-" + CHECKPOINT_FORMAT.format(Instant.now()) + ".zip")
                    .toAbsolutePath()
                    .normalize();
            Files.createDirectories(checkpoint.getParent());
            fileOperations.zipDirectory(orphanPath, checkpoint);
            fileOperations.deleteRecursively(orphanPath);
            activityLogService.success(
                    "system",
                    "storage_cleanup",
                    "Removed unused app data",
                    "Removed " + safeName + " after creating a safety checkpoint.",
                    null);
            return new StorageCleanupResult(
                    "completed",
                    "Removed unused app data after creating a safety checkpoint.",
                    safeName,
                    orphanPath.toString(),
                    removedBytes,
                    checkpoint.toString(),
                    Instant.now());
        } catch (IOException exception) {
            activityLogService.error("system", "storage_cleanup", "Storage cleanup failed", exception.getMessage(), null, exception);
            throw new com.projectos.marketplace.install.InstallationException("Autark-OS could not clean up that folder.", exception);
        }
    }

    private AppStorageUsage appStorage(InstalledApp app) {
        Path path = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        InstallSettings settings = installedAppRepository.settingsFor(app.appId()).orElse(null);
        long usedBytes = fileOperations.directorySize(path);
        List<StorageTrendPoint> trend = storageSampleRepository.forAppSince(app.appId(), Instant.now().minus(STORAGE_SAMPLE_RETENTION));
        long growth = trend.isEmpty() ? 0 : usedBytes - trend.getFirst().usedBytes();
        return new AppStorageUsage(
                app.appId(),
                app.appName(),
                app.status(),
                path.toString(),
                usedBytes,
                growth,
                trend,
                settings == null || settings.backup().enabled(),
                settings == null ? "daily" : settings.backup().frequency(),
                "Not recorded");
    }

    private void recordStorageSamples(List<AppStorageUsage> apps) {
        Instant sampledAt = Instant.now();
        for (AppStorageUsage app : apps) {
            storageSampleRepository.record(app.appId(), app.usedBytes(), sampledAt);
        }
        storageSampleRepository.deleteBefore(sampledAt.minus(STORAGE_SAMPLE_RETENTION));
    }

    private List<OrphanedStorage> orphanedStorage(Path appsRoot, Set<String> installedIds) {
        if (!Files.isDirectory(appsRoot)) {
            return List.of();
        }
        try (Stream<Path> stream = Files.list(appsRoot)) {
            return stream
                    .filter(Files::isDirectory)
                    .filter(path -> !installedIds.contains(path.getFileName().toString()))
                    .map(path -> new OrphanedStorage(path.getFileName().toString(), path.toAbsolutePath().normalize().toString(), fileOperations.directorySize(path)))
                    .sorted(Comparator.comparingLong(OrphanedStorage::usedBytes).reversed())
                    .toList();
        } catch (IOException exception) {
            return List.of();
        }
    }

    private List<InstalledApp> managedInstalledApps() {
        Set<String> managedIds = appInstanceViewProvider.list().stream()
                .map(AppInstanceView::catalogAppId)
                .filter(id -> id != null && !id.isBlank())
                .collect(HashSet::new, Set::add, Set::addAll);
        return installedAppRepository.findAll().stream()
                .filter(app -> managedIds.contains(app.appId()))
                .toList();
    }

    private StorageUsage diskUsage(String label, Path path) {
        try {
            ensure(path);
            FileStore store = Files.getFileStore(path);
            long total = store.getTotalSpace();
            long usable = store.getUsableSpace();
            long used = Math.max(0, total - usable);
            return new StorageUsage(label, path.toAbsolutePath().normalize().toString(), total, usable, used, ratioPercent(used, total));
        } catch (IOException exception) {
            return new StorageUsage(label, path.toAbsolutePath().normalize().toString(), 0, 0, 0, -1);
        }
    }

    private StorageUsage directoryUsage(String label, Path path, long totalBytes, long usableBytes) {
        long used = fileOperations.directorySize(path);
        return new StorageUsage(label, path.toAbsolutePath().normalize().toString(), totalBytes, usableBytes, used, ratioPercent(used, totalBytes));
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

    private List<StorageRecommendation> recommendations(String status, StorageUsage hostDisk, StorageUsage backupStorage, List<OrphanedStorage> orphaned, List<AppStorageUsage> apps) {
        java.util.ArrayList<StorageRecommendation> recommendations = new java.util.ArrayList<>();
        if ("critical".equals(status)) {
            recommendations.add(new StorageRecommendation("disk-critical", "danger", "Free up space soon", "The host disk is critically full. Installs, backups, and app updates may fail.", "Review largest apps"));
        } else if (hostDisk.usedPercent() >= 75) {
            recommendations.add(new StorageRecommendation("disk-warning", "warning", "Storage is getting tight", "Autark-OS can still run, but new installs and backups may become unreliable.", "Review storage"));
        } else {
            recommendations.add(new StorageRecommendation("disk-healthy", "success", "Storage looks healthy", "Autark-OS has enough free space for normal operation.", null));
        }
        if (!orphaned.isEmpty()) {
            recommendations.add(new StorageRecommendation("orphaned-data", "warning", "Unused app data found", "Autark-OS found folders that do not match an installed app. Review them before cleanup.", "Review unused data"));
        }
        if (backupStorage.usedBytes() == 0) {
            recommendations.add(new StorageRecommendation("backups-empty", "neutral", "No backup files found", "Backup storage is empty. Run a routine or manual backup to create the first restore point.", "Open backups"));
        }
        apps.stream().filter(app -> !app.backupEnabled()).findFirst().ifPresent(app ->
                recommendations.add(new StorageRecommendation("backup-disabled", "warning", "Some apps are not protected", "At least one installed app is excluded from routine backup protection.", "Open backups")));
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

    private String summary(String status, StorageUsage hostDisk, StorageUsage runtimeDisk, int orphanedCount) {
        String base = "Autark-OS is using " + readableBytes(runtimeDisk.usedBytes()) + " on a host with " + readableBytes(hostDisk.usableBytes()) + " free.";
        if ("critical".equals(status)) {
            return base + " Free space is low enough that installs or backups may fail.";
        }
        if (orphanedCount > 0) {
            return base + " " + orphanedCount + " unused app data folder" + (orphanedCount == 1 ? " was" : "s were") + " found.";
        }
        return base;
    }

    private void maybeLogWarning(String status, StorageUsage hostDisk, int orphanedCount) {
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
            throw new com.projectos.marketplace.install.InstallationException("Cleanup target must be a safe app-folder name.");
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
