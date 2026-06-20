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
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.system.api.RuntimeMigrationPlan;

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
    private final RuntimeFileOperations fileOperations;
    private Instant lastWarningLoggedAt = Instant.EPOCH;
    private String lastWarningStatus = "";

    public StorageService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, ActivityLogService activityLogService, StorageSampleRepository storageSampleRepository) {
        this(runtimeLayout, installedAppRepository, activityLogService, storageSampleRepository, new RuntimeFileOperations());
    }

    @Autowired
    public StorageService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, ActivityLogService activityLogService, StorageSampleRepository storageSampleRepository, RuntimeFileOperations fileOperations) {
        this.runtimeLayout = runtimeLayout;
        this.installedAppRepository = installedAppRepository;
        this.activityLogService = activityLogService;
        this.storageSampleRepository = storageSampleRepository;
        this.fileOperations = fileOperations;
    }

    public StorageReport report() {
        Path runtimeRoot = runtimeLayout.runtimeRoot();
        Path appsRoot = runtimeRoot.resolve("apps").normalize();
        Path backupsRoot = runtimeRoot.resolve("backups").normalize();
        ensure(runtimeRoot);

        List<InstalledApp> installedApps = installedAppRepository.findAll();
        Set<String> installedIds = installedApps.stream().map(InstalledApp::appId).collect(HashSet::new, Set::add, Set::addAll);
        StorageUsage hostDisk = diskUsage("Host disk", runtimeRoot);
        StorageUsage runtimeDisk = directoryUsage("Project OS data", runtimeRoot, hostDisk.totalBytes(), hostDisk.usableBytes());
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
                migrationGuidance(runtimeRoot),
                Instant.now());
    }

    public StorageCleanupResult cleanupOrphan(String name) {
        String safeName = safeOrphanName(name);
        Path appsRoot = runtimeLayout.runtimeRoot().resolve("apps").toAbsolutePath().normalize();
        Path orphanPath = appsRoot.resolve(safeName).normalize();
        if (!orphanPath.startsWith(appsRoot) || !Files.isDirectory(orphanPath)) {
            throw new com.projectos.marketplace.install.InstallationException("Project OS could not find that unused app data folder.");
        }
        Set<String> installedIds = installedAppRepository.findAll().stream().map(InstalledApp::appId).collect(HashSet::new, Set::add, Set::addAll);
        if (installedIds.contains(safeName)) {
            throw new com.projectos.marketplace.install.InstallationException("Project OS will not remove data for an installed app.");
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
            throw new com.projectos.marketplace.install.InstallationException("Project OS could not clean up that folder.", exception);
        }
    }

    public RuntimeMigrationPlan migrationPlan(String targetPath) {
        Path source = runtimeLayout.runtimeRoot().toAbsolutePath().normalize();
        Path target = targetPath == null || targetPath.isBlank() ? Path.of("") : Path.of(targetPath).toAbsolutePath().normalize();
        java.util.ArrayList<String> blocked = new java.util.ArrayList<>();
        java.util.ArrayList<String> warnings = new java.util.ArrayList<>();

        if (targetPath == null || targetPath.isBlank()) {
            blocked.add("Choose an absolute target path before Project OS can plan a migration.");
        } else if (!Path.of(targetPath).isAbsolute()) {
            blocked.add("Migration target must be an absolute path.");
        }
        if (target.equals(source)) {
            blocked.add("Migration target is already the current runtime path.");
        }
        if (target.startsWith(source) && !target.equals(source)) {
            blocked.add("Migration target cannot be inside the current runtime folder.");
        }
        if (source.startsWith(target)) {
            blocked.add("Migration target cannot be a parent of the current runtime folder.");
        }

        ensure(source);
        long sourceUsedBytes = fileOperations.directorySize(source);
        StorageUsage targetDisk = diskUsage("Migration target disk", target.getParent() == null ? target : target.getParent());
        long targetUsableBytes = targetDisk.usableBytes();
        if (targetUsableBytes > 0 && targetUsableBytes < sourceUsedBytes) {
            blocked.add("Migration target does not have enough usable space for the current runtime data.");
        }
        if (Files.exists(target) && !Files.isDirectory(target)) {
            blocked.add("Migration target exists but is not a directory.");
        }
        if (Files.exists(target) && Files.isDirectory(target)) {
            try (Stream<Path> children = Files.list(target)) {
                if (children.findAny().isPresent()) {
                    warnings.add("Migration target is not empty. Project OS should use an empty folder or a folder dedicated to Project OS data.");
                }
            } catch (IOException exception) {
                warnings.add("Project OS could not inspect whether the target folder is empty: " + exception.getMessage());
            }
        }

        boolean executable = blocked.isEmpty();
        String status = executable ? (warnings.isEmpty() ? "ready" : "review") : "blocked";
        return new RuntimeMigrationPlan(
                status,
                executable ? "Runtime data can be moved after confirmation" : "Runtime migration needs changes first",
                executable
                        ? "Project OS can prepare a guarded migration plan for this target. Execution still requires an explicit confirmation and privileged helper."
                        : "Project OS found issues that must be fixed before runtime data can be moved.",
                executable,
                source.toString(),
                target.toString(),
                sourceUsedBytes,
                targetUsableBytes,
                mountDescription(source),
                mountDescription(target.getParent() == null ? target : target.getParent()),
                affectedPaths(source),
                warnings,
                blocked,
                migrationSteps(target),
                rollbackGuidance(source),
                Instant.now());
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
            recommendations.add(new StorageRecommendation("disk-warning", "warning", "Storage is getting tight", "Project OS can still run, but new installs and backups may become unreliable.", "Review storage"));
        } else {
            recommendations.add(new StorageRecommendation("disk-healthy", "success", "Storage looks healthy", "Project OS has enough free space for normal operation.", null));
        }
        if (!orphaned.isEmpty()) {
            recommendations.add(new StorageRecommendation("orphaned-data", "warning", "Unused app data found", "Project OS found folders that do not match an installed app. Review them before cleanup.", "Review unused data"));
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
        String base = "Project OS is using " + readableBytes(runtimeDisk.usedBytes()) + " on a host with " + readableBytes(hostDisk.usableBytes()) + " free.";
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

    private RuntimeMigrationGuidance migrationGuidance(Path runtimeRoot) {
        String currentPath = runtimeRoot.toAbsolutePath().normalize().toString();
        boolean defaultPath = currentPath.equals("/var/lib/project-os");
        return new RuntimeMigrationGuidance(
                currentPath,
                defaultPath ? "available" : "customized",
                defaultPath
                        ? "Project OS is using the default runtime location. For Raspberry Pi or small disks, move app data to a stable SSD mount."
                        : "Project OS is already using a custom runtime location.",
                List.of(
                        "Stop Project OS before moving data: sudo systemctl stop project-os.service",
                        "Mount the SSD with a stable UUID entry in /etc/fstab.",
                        "Rerun the installer with --runtime-dir /path/on/ssd.",
                        "Start Project OS and confirm apps, backups, and storage paths before deleting the old copy."));
    }

    private List<String> affectedPaths(Path source) {
        return List.of(
                source.toString(),
                source.resolve("apps").toString(),
                source.resolve("backups").toString(),
                source.resolve("project-os.db").toString());
    }

    private List<RuntimeMigrationPlan.Step> migrationSteps(Path target) {
        return List.of(
                new RuntimeMigrationPlan.Step("backup", "Create pre-migration checkpoint", "Create or select a fresh restore point before changing runtime storage.", false),
                new RuntimeMigrationPlan.Step("stop-service", "Stop Project OS service", "Stop project-os.service so runtime files do not change during copy.", true),
                new RuntimeMigrationPlan.Step("sync-data", "Copy runtime data", "Copy Project OS runtime data to " + target + " while preserving file metadata.", true),
                new RuntimeMigrationPlan.Step("validate-copy", "Validate copied data", "Confirm expected folders, database, and copied byte counts before switching paths.", true),
                new RuntimeMigrationPlan.Step("update-env", "Update runtime configuration", "Update /etc/project-os/project-os.env with the new runtime path.", true),
                new RuntimeMigrationPlan.Step("fix-permissions", "Repair ownership and permissions", "Ensure the projectos service user can read and write the moved runtime data.", true),
                new RuntimeMigrationPlan.Step("restart-service", "Restart Project OS service", "Start project-os.service using the new runtime location.", true),
                new RuntimeMigrationPlan.Step("verify", "Verify Project OS state", "Confirm apps, backups, and storage reporting before old data is removed.", false));
    }

    private List<String> rollbackGuidance(Path source) {
        return List.of(
                "Keep the original runtime folder at " + source + " until Project OS verifies the new location.",
                "If verification fails, stop project-os.service, restore PROJECT_OS_RUNTIME_DIR to " + source + ", and start the service again.",
                "Do not delete the original runtime folder until apps, backups, and support status are healthy.");
    }

    private String mountDescription(Path path) {
        try {
            FileStore store = Files.getFileStore(path);
            return store.name() + " (" + store.type() + ")";
        } catch (IOException exception) {
            return "unavailable: " + exception.getMessage();
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
