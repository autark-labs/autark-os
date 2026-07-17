package com.autarkos.backups;

import java.time.Instant;

public final class RestorePoints {

    private RestorePoints() {
    }

    public static RestorePointEntity create(String appId, String appName, String scope, String source, String includedAppIds, String path, String status, long sizeBytes, String message) {
        return create(appId, appName, scope, source, includedAppIds, path, status, sizeBytes, message, "", "legacy_unverified", 0);
    }

    public static RestorePointEntity create(String appId, String appName, String scope, String source, String includedAppIds, String path, String status, long sizeBytes, String message, String integrityBaselineSha256, String backupContractStrategy, int backupContractVersion) {
        return new RestorePointEntity(
                appId,
                appName,
                clean(scope, "app"),
                clean(source, "manual"),
                clean(includedAppIds, appId),
                path == null ? "" : path,
                clean(status, "failed"),
                sizeBytes,
                message == null ? "" : message,
                integrityBaselineSha256 == null ? "" : integrityBaselineSha256,
                clean(backupContractStrategy, "legacy_unverified"),
                Math.max(backupContractVersion, 0),
                Instant.now().toString());
    }

    public static RestorePoint toDomain(RestorePointEntity entity) {
        return new RestorePoint(
                entity.id() == null ? 0 : entity.id(),
                entity.appId(),
                entity.appName(),
                clean(entity.scope(), "app"),
                clean(entity.source(), "manual"),
                clean(entity.includedAppIds(), entity.appId()),
                entity.status(),
                entity.path(),
                entity.sizeBytes(),
                entity.message(),
                clean(entity.verificationStatus(), "not_checked"),
                clean(entity.verificationMessage(), "Backup has not been verified yet."),
                entity.checksumSha256() == null ? "" : entity.checksumSha256(),
                entity.integrityBaselineSha256() == null ? "" : entity.integrityBaselineSha256(),
                clean(entity.backupContractStrategy(), "legacy_unverified"),
                Math.max(entity.backupContractVersion(), 0),
                clean(entity.restoreConfidence(), "unknown"),
                instant(entity.verifiedAt()),
                Instant.parse(entity.createdAt()));
    }

    public static String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static Instant instant(String value) {
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }
}
