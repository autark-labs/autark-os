package com.projectos.system;

import java.net.InetAddress;
import java.time.Instant;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.projectos.activity.ActivityLogService;
import com.projectos.marketplace.install.BackupPolicy;
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppRepository;

@Service
public class ProjectSettingsService {

    private static final Set<String> ACCESS_MODES = Set.of("manifest-default", "local", "private", "local-and-private");
    private static final Set<String> BACKUP_FREQUENCIES = Set.of("hourly", "daily", "weekly");
    private static final Set<String> TIME_FORMATS = Set.of("12-hour", "24-hour");
    private static final Set<String> TEMPERATURE_UNITS = Set.of("fahrenheit", "celsius");
    private static final Set<String> UPDATE_CHANNELS = Set.of("stable", "preview");

    private final ProjectSettingsRepository repository;
    private final ActivityLogService activityLogService;
    private final InstalledAppRepository installedAppRepository;

    public ProjectSettingsService(ProjectSettingsRepository repository, ActivityLogService activityLogService) {
        this(repository, activityLogService, null);
    }

    @Autowired
    public ProjectSettingsService(ProjectSettingsRepository repository, ActivityLogService activityLogService, InstalledAppRepository installedAppRepository) {
        this.repository = repository;
        this.activityLogService = activityLogService;
        this.installedAppRepository = installedAppRepository;
    }

    public ProjectSettings current() {
        ProjectSettings defaults = ProjectSettings.defaults(defaultDeviceName());
        Map<String, String> values = repository.readAll();
        if (values.isEmpty()) {
            repository.save(defaults);
            return defaults;
        }
        return from(values, defaults);
    }

    public ProjectSettings update(ProjectSettings settings) {
        ProjectSettings current = current();
        ProjectSettings sanitized = sanitize(settings, current);
        repository.save(sanitized);
        activityLogService.info("settings", "project_settings_updated", "Project OS settings updated", "Saved Project OS preferences.");
        return sanitized;
    }

    public ProjectSettingsAppDefaultsResult applyAppDefaults(ProjectSettings settings) {
        ProjectSettings sanitized = sanitize(settings, current());
        if (installedAppRepository == null) {
            return new ProjectSettingsAppDefaultsResult(false, "error", "App defaults unavailable", "Project OS cannot update app defaults in this runtime.", 0, Instant.now());
        }
        int updated = 0;
        BackupPolicy backup = new BackupPolicy(sanitized.automaticBackupsEnabled(), sanitized.backupFrequency(), sanitized.backupRetentionDays());
        for (InstalledApp app : installedAppRepository.findAll()) {
            InstallSettings current = installedAppRepository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(app.accessUrl()));
            installedAppRepository.saveSettings(app.appId(), new InstallSettings(
                    current.accessUrl(),
                    current.privateAccessUrl(),
                    current.tailscaleEnabled(),
                    current.storageSubfolders(),
                    backup,
                    current.desiredAccessMode(),
                    current.privateAccessRequirement(),
                    current.expectedLocalPort(),
                    current.expectedProtocol(),
                    current.lastAccessCheckAt(),
                    current.lastSuccessfulAccessAt(),
                    current.lastRepairAttemptAt(),
                    current.lastRepairStatus(),
                    sanitized.automaticRepairEnabled()));
            updated++;
        }
        activityLogService.info("settings", "app_defaults_applied", "App defaults applied", "Applied backup and repair defaults to " + updated + " app(s).");
        return new ProjectSettingsAppDefaultsResult(true, "success", "App defaults applied", "Applied backup and repair defaults to " + updated + " app(s).", updated, Instant.now());
    }

    private ProjectSettings sanitize(ProjectSettings settings, ProjectSettings fallback) {
        if (settings == null) {
            return fallback;
        }
        return new ProjectSettings(
                clean(settings.deviceName(), fallback.deviceName(), 48),
                clean(settings.timeZone(), fallback.timeZone(), 64),
                clean(settings.language(), fallback.language(), 16),
                oneOf(settings.temperatureUnit(), TEMPERATURE_UNITS, fallback.temperatureUnit()),
                clean(settings.dateFormat(), fallback.dateFormat(), 32),
                oneOf(settings.timeFormat(), TIME_FORMATS, fallback.timeFormat()),
                settings.startOnBoot(),
                settings.telemetryEnabled(),
                oneOf(settings.defaultInstallAccess(), ACCESS_MODES, fallback.defaultInstallAccess()),
                settings.automaticRepairEnabled(),
                settings.automaticBackupsEnabled(),
                oneOf(settings.backupFrequency(), BACKUP_FREQUENCIES, fallback.backupFrequency()),
                clamp(settings.backupRetentionDays(), 1, 90, fallback.backupRetentionDays()),
                clean(settings.backupTime(), fallback.backupTime(), 8),
                oneOf(settings.updateChannel(), UPDATE_CHANNELS, fallback.updateChannel()),
                settings.showAdvancedMetrics(),
                Instant.now());
    }

    private ProjectSettings from(Map<String, String> values, ProjectSettings fallback) {
        return new ProjectSettings(
                string(values, "deviceName", fallback.deviceName()),
                string(values, "timeZone", fallback.timeZone()),
                string(values, "language", fallback.language()),
                oneOf(string(values, "temperatureUnit", fallback.temperatureUnit()), TEMPERATURE_UNITS, fallback.temperatureUnit()),
                string(values, "dateFormat", fallback.dateFormat()),
                oneOf(string(values, "timeFormat", fallback.timeFormat()), TIME_FORMATS, fallback.timeFormat()),
                bool(values, "startOnBoot", fallback.startOnBoot()),
                bool(values, "telemetryEnabled", fallback.telemetryEnabled()),
                oneOf(string(values, "defaultInstallAccess", fallback.defaultInstallAccess()), ACCESS_MODES, fallback.defaultInstallAccess()),
                bool(values, "automaticRepairEnabled", fallback.automaticRepairEnabled()),
                bool(values, "automaticBackupsEnabled", fallback.automaticBackupsEnabled()),
                oneOf(string(values, "backupFrequency", fallback.backupFrequency()), BACKUP_FREQUENCIES, fallback.backupFrequency()),
                clamp(intValue(values, "backupRetentionDays", fallback.backupRetentionDays()), 1, 90, fallback.backupRetentionDays()),
                string(values, "backupTime", fallback.backupTime()),
                oneOf(string(values, "updateChannel", fallback.updateChannel()), UPDATE_CHANNELS, fallback.updateChannel()),
                bool(values, "showAdvancedMetrics", fallback.showAdvancedMetrics()),
                instant(values, "updatedAt", fallback.updatedAt()));
    }

    private String defaultDeviceName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (RuntimeException | java.net.UnknownHostException exception) {
            return "project-os";
        }
    }

    private String string(Map<String, String> values, String key, String fallback) {
        String value = values.get(key);
        return value == null || value.isBlank() ? fallback : value;
    }

    private boolean bool(Map<String, String> values, String key, boolean fallback) {
        String value = values.get(key);
        return value == null || value.isBlank() ? fallback : Boolean.parseBoolean(value);
    }

    private int intValue(Map<String, String> values, String key, int fallback) {
        try {
            return Integer.parseInt(values.getOrDefault(key, Integer.toString(fallback)));
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private Instant instant(Map<String, String> values, String key, Instant fallback) {
        try {
            return Instant.parse(values.getOrDefault(key, fallback.toString()));
        } catch (RuntimeException exception) {
            return fallback;
        }
    }

    private String clean(String value, String fallback, int maxLength) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.length() > maxLength ? trimmed.substring(0, maxLength) : trimmed;
    }

    private String oneOf(String value, Set<String> allowed, String fallback) {
        if (value == null) {
            return fallback;
        }
        String normalized = value.trim().toLowerCase();
        return allowed.contains(normalized) ? normalized : fallback;
    }

    private int clamp(int value, int min, int max, int fallback) {
        if (value < min || value > max) {
            return fallback;
        }
        return value;
    }
}
