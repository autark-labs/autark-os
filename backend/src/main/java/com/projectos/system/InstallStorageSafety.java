package com.projectos.system;

public record InstallStorageSafety(
        String status,
        String message,
        long minimumRecommendedFreeBytes,
        long currentFreeBytes,
        boolean installAllowed) {
}
