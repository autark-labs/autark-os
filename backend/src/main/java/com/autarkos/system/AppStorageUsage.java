package com.autarkos.system;

public record AppStorageUsage(
        String appId,
        String appName,
        String status,
        String path,
        long usedBytes,
        long sevenDayGrowthBytes,
        java.util.List<StorageTrendPoint> trend,
        boolean backupEnabled,
        String backupFrequency,
        String lastBackup) {
}
