package com.projectos.system;

import java.time.Instant;
import java.util.List;

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
        RuntimeMigrationGuidance migrationGuidance,
        Instant checkedAt) {
}
