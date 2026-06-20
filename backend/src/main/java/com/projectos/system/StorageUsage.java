package com.projectos.system;

public record StorageUsage(
        String label,
        String path,
        long totalBytes,
        long usableBytes,
        long usedBytes,
        double usedPercent) {
}
