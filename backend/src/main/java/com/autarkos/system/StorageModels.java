package com.autarkos.system;

import java.time.Instant;
import java.util.List;

public final class StorageModels {

    private StorageModels() {
    }

    public record AppStorageUsage(
            String appId,
            String appName,
            String status,
            String path,
            long usedBytes,
            long sevenDayGrowthBytes,
            List<StorageTrendPoint> trend,
            boolean backupEnabled,
            String backupFrequency,
            String lastBackup) {
    }

    public record OrphanedStorage(
            String name,
            String path,
            long usedBytes) {
    }

    public record StorageCleanupResult(
            String status,
            String message,
            String removedName,
            String removedPath,
            long removedBytes,
            String safetyCheckpointPath,
            Instant completedAt) {
    }

    public record StorageRecommendation(
            String id,
            String tone,
            String title,
            String message,
            String actionLabel) {
    }

    public record StorageReport(
            String status,
            String headline,
            String summary,
            StorageUsage hostDisk,
            StorageUsage runtimeDisk,
            StorageUsage backupStorage,
            List<AppStorageUsage> apps,
            List<OrphanedStorage> orphanedData,
            List<StorageRecommendation> recommendations,
            InstallStorageSafety installSafety,
            Instant checkedAt) {
    }

    public record StorageTrendPoint(
            long usedBytes,
            Instant sampledAt) {
    }

    public record StorageUsage(
            String label,
            String path,
            long totalBytes,
            long usableBytes,
            long usedBytes,
            double usedPercent) {
    }
}
