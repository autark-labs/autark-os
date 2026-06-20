package com.projectos.system;

import java.time.Instant;

public record ProjectSettings(
        String deviceName,
        String timeZone,
        String language,
        String temperatureUnit,
        String dateFormat,
        String timeFormat,
        boolean startOnBoot,
        boolean telemetryEnabled,
        String defaultInstallAccess,
        boolean automaticRepairEnabled,
        boolean automaticBackupsEnabled,
        String backupFrequency,
        int backupRetentionDays,
        String backupTime,
        String updateChannel,
        boolean showAdvancedMetrics,
        Instant updatedAt) {

    public static ProjectSettings defaults(String deviceName) {
        return new ProjectSettings(
                deviceName == null || deviceName.isBlank() ? "project-os" : deviceName,
                "America/Chicago",
                "en-US",
                "fahrenheit",
                "MMM d, yyyy",
                "12-hour",
                true,
                false,
                "manifest-default",
                true,
                true,
                "daily",
                7,
                "02:00",
                "stable",
                false,
                Instant.now());
    }
}
