package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;

final class InstalledApps {

    private InstalledApps() {
    }

    static InstalledAppEntity entity(InstalledApp app, InstalledAppEntity existing, Instant now) {
        if (existing == null) {
            return new InstalledAppEntity(app, now.toString());
        }
        existing.updateFrom(app, now.toString());
        return existing;
    }

    static InstalledApp app(InstalledAppEntity entity) {
        return new InstalledApp(
                entity.appId(),
                entity.appName(),
                entity.status(),
                entity.runtimePath(),
                entity.composeProject(),
                entity.accessUrl(),
                Instant.parse(entity.installedAt()));
    }

    static RuntimeModels.InstalledAppOwnershipMetadata ownership(InstalledAppEntity entity) {
        return new RuntimeModels.InstalledAppOwnershipMetadata(
                entity.appId(),
                valueOr(entity.appInstanceId(), ""),
                valueOr(entity.catalogAppId(), entity.appId()),
                valueOr(entity.autarkOsInstanceId(), ""),
                valueOr(entity.runtimePathOrHash(), entity.runtimePath()),
                valueOr(entity.installState(), entity.status()),
                valueOr(entity.ownershipStatus(), "ownership_uncertain"),
                instant(valueOr(entity.createdAt(), entity.installedAt())),
                instant(valueOr(entity.updatedAt(), entity.installedAt())));
    }

    static InstallModels.InstallSettings settings(InstallSettingsRow row) {
        return new InstallModels.InstallSettings(
                row.getAccessUrl(),
                row.getPrivateAccessUrl(),
                row.getTailscaleEnabled() == 1,
                decodeMap(row.getStorageSubfolders()),
                new InstallModels.BackupPolicy(row.getBackupEnabled() == 1, row.getBackupFrequency(), row.getBackupRetention()),
                row.getDesiredAccessMode(),
                row.getPrivateAccessRequirement(),
                row.getExpectedLocalPort(),
                row.getExpectedProtocol(),
                instant(row.getLastAccessCheckAt()),
                instant(row.getLastSuccessfulAccessAt()),
                instant(row.getLastRepairAttemptAt()),
                row.getLastRepairStatus(),
                row.getAutoRepairEnabled() == 1);
    }

    static AppEvent event(AppEventRow row) {
        return new AppEvent(
                row.getId(),
                row.getAppId(),
                row.getEventType(),
                row.getMessage(),
                Instant.parse(row.getCreatedAt()));
    }

    static AppHealthSnapshot healthSnapshot(AppHealthRow row) {
        return new AppHealthSnapshot(
                row.getAppId(),
                row.getStatus(),
                valueOr(row.getMessage(), row.getStatus()),
                valueOr(row.getDetail(), ""),
                valueOr(row.getDockerStatus(), row.getStatus()),
                valueOr(row.getLocalAccessStatus(), "not_checked"),
                valueOr(row.getPrivateAccessStatus(), "not_checked"),
                row.getStartupGrace() == 1,
                Instant.parse(row.getCheckedAt()));
    }

    static String encodeMap(Map<String, String> values) {
        if (values == null || values.isEmpty()) {
            return "";
        }
        return values.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .reduce((left, right) -> left + ";" + right)
                .orElse("");
    }

    static String encodeInstant(Instant value) {
        return value == null ? null : value.toString();
    }

    private static Map<String, String> decodeMap(String value) {
        if (value == null || value.isBlank()) {
            return Map.of();
        }
        Map<String, String> values = new LinkedHashMap<>();
        for (String pair : value.split(";")) {
            String[] parts = pair.split("=", 2);
            if (parts.length == 2 && !parts[0].isBlank() && !parts[1].isBlank()) {
                values.put(parts[0], parts[1]);
            }
        }
        return values;
    }

    private static Instant instant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Instant.parse(value);
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    interface InstallSettingsRow {
        String getAccessUrl();

        String getPrivateAccessUrl();

        int getTailscaleEnabled();

        String getStorageSubfolders();

        int getBackupEnabled();

        String getBackupFrequency();

        int getBackupRetention();

        String getDesiredAccessMode();

        String getPrivateAccessRequirement();

        Integer getExpectedLocalPort();

        String getExpectedProtocol();

        String getLastAccessCheckAt();

        String getLastSuccessfulAccessAt();

        String getLastRepairAttemptAt();

        String getLastRepairStatus();

        int getAutoRepairEnabled();
    }

    interface AppEventRow {
        long getId();

        String getAppId();

        String getEventType();

        String getMessage();

        String getCreatedAt();
    }

    interface AppHealthRow {
        String getAppId();

        String getStatus();

        String getMessage();

        String getDetail();

        String getDockerStatus();

        String getLocalAccessStatus();

        String getPrivateAccessStatus();

        int getStartupGrace();

        String getCheckedAt();
    }
}
