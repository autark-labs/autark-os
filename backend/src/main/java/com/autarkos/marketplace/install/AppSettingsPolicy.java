package com.autarkos.marketplace.install;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.model.AccessManifest;
import com.autarkos.marketplace.model.ApplicationManifest;

class AppSettingsPolicy {

    private static final Pattern SAFE_STORAGE_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,63}");
    private static final Set<String> BACKUP_FREQUENCIES = Set.of("hourly", "daily", "weekly");

    private final InstalledAppRepository repository;
    private final AppRuntimeStatusResolver runtimeStatusResolver;

    AppSettingsPolicy(InstalledAppRepository repository, AppRuntimeStatusResolver runtimeStatusResolver) {
        this.repository = repository;
        this.runtimeStatusResolver = runtimeStatusResolver;
    }

    InstallModels.AppSettingsChangePlan settingsChangePlan(InstalledApp app, InstallModels.InstallSettings current, InstallModels.InstallSettings requested) {
        List<String> changes = new java.util.ArrayList<>();
        List<String> warnings = new java.util.ArrayList<>();
        List<String> blocked = new java.util.ArrayList<>();
        boolean redeployRequired = false;
        boolean restartRequired = false;
        boolean dataMigrationRequired = false;

        Integer currentPort = current.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(firstPresent(current.accessUrl(), app.accessUrl())) : current.expectedLocalPort();
        Integer requestedPort = requested.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(requested.accessUrl()) : requested.expectedLocalPort();
        if (!same(current.accessUrl(), requested.accessUrl()) || !same(currentPort, requestedPort)) {
            changes.add("Local app address will change to " + requested.accessUrl() + ".");
            if (!same(currentPort, requestedPort)) {
                redeployRequired = true;
                warnings.add("Autark-OS will update the Compose file and restart the app containers so the new port is active.");
            }
        }
        if (!same(current.expectedProtocol(), requested.expectedProtocol())) {
            changes.add("Expected protocol will change to " + requested.expectedProtocol() + ".");
            restartRequired = true;
        }
        if (current.tailscaleEnabled() != requested.tailscaleEnabled()) {
            changes.add(requested.tailscaleEnabled() ? "Private access preference will be enabled." : "Private access preference will be disabled.");
            warnings.add("Private access is safest to manage from Network, where Autark-OS can repair and verify Tailscale links.");
        }
        if (!same(current.backup(), requested.backup())) {
            changes.add("Backup preference will be saved for this app.");
        }
        if (current.autoRepairEnabled() != requested.autoRepairEnabled()) {
            changes.add(requested.autoRepairEnabled() ? "Automatic fixes will be enabled." : "Automatic fixes will be disabled.");
        }
        if (!same(current.storageSubfolders(), requested.storageSubfolders())) {
            dataMigrationRequired = true;
            changes.add("Storage folder names were changed.");
            blocked.add("Storage folder changes need a guarded data migration. Autark-OS will not move app data from this modal yet.");
        }

        if (changes.isEmpty()) {
            changes.add("No settings changes detected.");
        }
        String impact;
        if (!blocked.isEmpty()) {
            impact = "manual";
        } else if (dataMigrationRequired) {
            impact = "data_migration_required";
        } else if (redeployRequired) {
            impact = "redeploy_required";
        } else if (restartRequired) {
            impact = "restart_required";
        } else {
            impact = "database_only";
        }
        String headline = switch (impact) {
            case "manual" -> "Needs manual attention";
            case "data_migration_required" -> "Data migration required";
            case "redeploy_required" -> "App restart required";
            case "restart_required" -> "Restart recommended";
            default -> "Safe to save";
        };
        String summary = switch (impact) {
            case "manual" -> "Autark-OS cannot safely apply one or more settings yet.";
            case "data_migration_required" -> "Autark-OS needs a migration step before changing storage folders.";
            case "redeploy_required" -> "Autark-OS will rewrite the Compose file and start the app with the new settings.";
            case "restart_required" -> "Autark-OS will save the setting and may need a restart before it is reflected.";
            default -> "Autark-OS will save these settings without restarting containers.";
        };
        return new InstallModels.AppSettingsChangePlan(
                app.appId(),
                app.appName(),
                impact,
                headline,
                summary,
                blocked.isEmpty(),
                redeployRequired,
                restartRequired,
                dataMigrationRequired,
                changes,
                warnings,
                blocked);
    }

    InstallModels.InstallSettings sanitize(InstallModels.InstallSettings settings, InstalledApp app) {
        if (settings == null) {
            throw new InstallationException("Settings are required.");
        }
        String accessUrl = cleanAccessUrl(settings.accessUrl(), app.accessUrl());
        String privateAccessUrl = cleanOptionalAccessUrl(settings.privateAccessUrl());
        InstallModels.BackupPolicy backup = sanitizeBackup(settings.backup());
        Map<String, String> storage = sanitizeStorage(settings.storageSubfolders());
        String desiredMode = sanitizeAccessMode(settings.desiredAccessMode(), settings.tailscaleEnabled() ? "private" : null);
        String privateAccessRequirement = sanitizePrivateAccessRequirement(settings.privateAccessRequirement(), false);
        Integer expectedLocalPort = settings.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(accessUrl) : settings.expectedLocalPort();
        String expectedProtocol = sanitizeProtocol(settings.expectedProtocol(), accessUrl);
        return new InstallModels.InstallSettings(
                accessUrl,
                privateAccessUrl,
                settings.tailscaleEnabled(),
                storage,
                backup,
                desiredMode,
                privateAccessRequirement,
                expectedLocalPort,
                expectedProtocol,
                settings.lastAccessCheckAt(),
                settings.lastSuccessfulAccessAt(),
                settings.lastRepairAttemptAt(),
                settings.lastRepairStatus(),
                settings.autoRepairEnabled());
    }

    InstallModels.InstallSettings normalizeSettings(InstallModels.InstallSettings settings, InstalledApp app, ApplicationManifest manifest, String accessUrl) {
        AccessManifest accessManifest = manifest == null ? AccessManifest.defaults() : manifest.access();
        String desiredMode = sanitizeAccessMode(settings.desiredAccessMode(), settings.tailscaleEnabled() ? "private" : accessManifest.defaultMode());
        String requirement = privateAccessRequirement(settings.privateAccessRequirement(), manifest);
        Integer expectedPort = settings.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(accessUrl) : settings.expectedLocalPort();
        String expectedProtocol = sanitizeProtocol(settings.expectedProtocol(), accessUrl);
        InstallModels.InstallSettings normalized = new InstallModels.InstallSettings(
                accessUrl == null ? settings.accessUrl() : accessUrl,
                settings.privateAccessUrl(),
                settings.tailscaleEnabled(),
                settings.storageSubfolders() == null ? Map.of() : settings.storageSubfolders(),
                settings.backup() == null ? InstallModels.BackupPolicy.defaults() : settings.backup(),
                desiredMode,
                requirement,
                expectedPort,
                expectedProtocol,
                settings.lastAccessCheckAt(),
                settings.lastSuccessfulAccessAt(),
                settings.lastRepairAttemptAt(),
                settings.lastRepairStatus(),
                settings.autoRepairEnabled());
        if (!normalized.equals(settings)) {
            repository.saveSettings(app.appId(), normalized);
        }
        return normalized;
    }

    AccessModels.AccessDesiredState desiredAccessState(InstallModels.InstallSettings settings, ApplicationManifest manifest, String accessUrl, PrivateAccessState privateAccess) {
        String mode = sanitizeAccessMode(settings.desiredAccessMode(), settings.tailscaleEnabled() ? "private" : null);
        String requirement = privateAccessRequirement(settings.privateAccessRequirement(), manifest);
        boolean privateRecommended = manifest != null && manifest.access().privateAccessRecommended();
        return new AccessModels.AccessDesiredState(
                mode,
                accessModeLabel(mode),
                accessUrl,
                privateAccess == null ? settings.privateAccessUrl() : privateAccess.expectedPrivateUrl(),
                settings.expectedLocalPort(),
                firstPresent(settings.expectedProtocol(), "http"),
                requirement,
                "required".equals(requirement),
                privateRecommended);
    }

    AccessModels.AccessObservedState observedAccessState(InstallModels.InstallSettings settings, String accessUrl, PrivateAccessState privateAccess) {
        String privateStatus = privateAccess == null
                ? settings.tailscaleEnabled() ? "unknown" : "not_enabled"
                : privateAccess.status();
        return new AccessModels.AccessObservedState(
                accessUrl,
                privateAccess != null && privateAccess.verified() ? privateAccess.verifiedPrivateUrl() : null,
                runtimeStatusResolver.portFromUrl(accessUrl),
                runtimeStatusResolver.protocolFromUrl(accessUrl),
                privateStatus,
                settings.lastAccessCheckAt(),
                settings.lastSuccessfulAccessAt(),
                settings.lastRepairAttemptAt(),
                settings.lastRepairStatus());
    }

    AccessModels.AppAccessRoute accessRoute(InstallModels.InstallSettings settings, String accessUrl, AccessModels.AccessObservedState observedAccess, PrivateAccessState privateAccess) {
        Integer localPort = runtimeStatusResolver.portFromUrl(accessUrl);
        String verifiedPrivateUrl = privateAccess != null && privateAccess.verified() ? privateAccess.verifiedPrivateUrl() : null;
        Integer privatePort = privateAccess == null ? null : privateAccess.expectedHttpsPort();
        String privateStatus = observedAccess == null ? "not_enabled" : observedAccess.privateLinkStatus();
        String primaryOpenUrl = firstPresent(verifiedPrivateUrl, accessUrl);
        String backendProtocol = firstPresent(settings.expectedProtocol(), runtimeStatusResolver.protocolFromUrl(accessUrl), "http");
        String backendTargetUrl = localPort == null ? null : backendProtocol + "://127.0.0.1:" + localPort;
        return new AccessModels.AppAccessRoute(
                primaryOpenUrl,
                accessUrl,
                verifiedPrivateUrl,
                backendTargetUrl,
                backendProtocol,
                localPort,
                privatePort,
                privateStatus);
    }

    String sanitizeProtocol(String protocol, String accessUrl) {
        String value = firstPresent(protocol, runtimeStatusResolver.protocolFromUrl(accessUrl), "http").trim().toLowerCase();
        return switch (value) {
            case "http", "https" -> value;
            default -> "http";
        };
    }

    String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private boolean same(Object left, Object right) {
        return Objects.equals(left, right);
    }

    private String sanitizeAccessMode(String mode, String fallback) {
        String value = firstPresent(mode, fallback, "local").trim().toLowerCase();
        return switch (value) {
            case "private", "local-and-private", "none", "public", "network", "local" -> value;
            default -> "local";
        };
    }

    private String sanitizePrivateAccessRequirement(String requirement, boolean required) {
        String fallback = required ? "required" : "optional";
        String value = firstPresent(requirement, fallback).trim().toLowerCase();
        return switch (value) {
            case "required", "recommended", "optional", "disabled" -> value;
            default -> fallback;
        };
    }

    private String privateAccessRequirement(String requestedRequirement, ApplicationManifest manifest) {
        boolean recommendedByCatalog = manifest != null && manifest.usage().privateHttpsRequired();
        if (recommendedByCatalog && (requestedRequirement == null
                || requestedRequirement.isBlank()
                || "optional".equalsIgnoreCase(requestedRequirement))) {
            return "recommended";
        }
        String fallback = recommendedByCatalog ? "recommended" : "optional";
        return sanitizePrivateAccessRequirement(firstPresent(requestedRequirement, fallback), false);
    }

    private String accessModeLabel(String mode) {
        return switch (mode) {
            case "private" -> "Your private devices";
            case "local-and-private" -> "This device and your private devices";
            case "network" -> "Your home network";
            case "public" -> "Wider internet";
            case "none" -> "No browser link";
            default -> "Only this device";
        };
    }

    private String cleanAccessUrl(String accessUrl, String fallback) {
        String value = accessUrl == null || accessUrl.isBlank() ? fallback : accessUrl.trim();
        if (value == null || value.isBlank()) {
            return null;
        }
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            throw new InstallationException("Access URL must start with http:// or https://.");
        }
        return value;
    }

    private String cleanOptionalAccessUrl(String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return null;
        }
        String value = accessUrl.trim();
        if (!value.startsWith("https://")) {
            throw new InstallationException("Private access URL must start with https://.");
        }
        return value;
    }

    private InstallModels.BackupPolicy sanitizeBackup(InstallModels.BackupPolicy backup) {
        if (backup == null) {
            return InstallModels.BackupPolicy.defaults();
        }
        String frequency = backup.frequency() == null || backup.frequency().isBlank() ? "daily" : backup.frequency().trim().toLowerCase();
        if (!BACKUP_FREQUENCIES.contains(frequency)) {
            throw new InstallationException("Backup frequency must be hourly, daily, or weekly.");
        }
        if (backup.retention() < 1 || backup.retention() > 90) {
            throw new InstallationException("Backup retention must be between 1 and 90.");
        }
        return new InstallModels.BackupPolicy(backup.enabled(), frequency, backup.retention());
    }

    private Map<String, String> sanitizeStorage(Map<String, String> storageSubfolders) {
        if (storageSubfolders == null || storageSubfolders.isEmpty()) {
            return Map.of();
        }
        Map<String, String> sanitized = new LinkedHashMap<>();
        storageSubfolders.forEach((key, value) -> {
            if (key == null || key.isBlank()) {
                throw new InstallationException("Storage folder keys cannot be blank.");
            }
            String folder = value == null ? "" : value.trim();
            if (folder.isBlank()) {
                return;
            }
            if (!SAFE_STORAGE_NAME.matcher(folder).matches()) {
                throw new InstallationException("Storage folders can use letters, numbers, dots, underscores, and dashes only.");
            }
            sanitized.put(key.trim(), folder);
        });
        return sanitized;
    }
}
