package com.autarkos.system;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectSettingsRepository extends JpaRepository<ProjectSettingEntity, String> {

    default Map<String, String> readAll() {
        return findAll().stream()
                .collect(Collectors.toMap(ProjectSettingEntity::settingKey, ProjectSettingEntity::settingValue));
    }

    default Path backupDestination(Path fallback) {
        String destination = readAll().get("backupDestination");
        if (destination == null || destination.isBlank()) {
            return fallback.toAbsolutePath().normalize();
        }
        return Path.of(destination).toAbsolutePath().normalize();
    }

    default boolean hasAnySettings() {
        return count() > 0;
    }

    default void save(ProjectSettings settings) {
        saveValues(Map.ofEntries(
                Map.entry("deviceName", settings.deviceName()),
                Map.entry("timeZone", settings.timeZone()),
                Map.entry("language", settings.language()),
                Map.entry("temperatureUnit", settings.temperatureUnit()),
                Map.entry("dateFormat", settings.dateFormat()),
                Map.entry("timeFormat", settings.timeFormat()),
                Map.entry("startOnBoot", Boolean.toString(settings.startOnBoot())),
                Map.entry("telemetryEnabled", Boolean.toString(settings.telemetryEnabled())),
                Map.entry("defaultInstallAccess", settings.defaultInstallAccess()),
                Map.entry("automaticRepairEnabled", Boolean.toString(settings.automaticRepairEnabled())),
                Map.entry("automaticBackupsEnabled", Boolean.toString(settings.automaticBackupsEnabled())),
                Map.entry("backupFrequency", settings.backupFrequency()),
                Map.entry("backupRetentionDays", Integer.toString(settings.backupRetentionDays())),
                Map.entry("backupTime", settings.backupTime()),
                Map.entry("updateChannel", settings.updateChannel()),
                Map.entry("showAdvancedMetrics", Boolean.toString(settings.showAdvancedMetrics())),
                Map.entry("updatedAt", settings.updatedAt().toString())),
                settings.updatedAt());
    }

    default void saveValues(Map<String, String> values) {
        saveValues(values, Instant.now());
    }

    private void saveValues(Map<String, String> values, Instant updatedAt) {
        String timestamp = updatedAt.toString();
        saveAll(values.entrySet().stream()
                .map(entry -> new ProjectSettingEntity(entry.getKey(), entry.getValue() == null ? "" : entry.getValue(), timestamp))
                .toList());
    }
}
