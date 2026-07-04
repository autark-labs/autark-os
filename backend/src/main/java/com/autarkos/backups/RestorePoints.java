package com.autarkos.backups;

import java.time.Instant;

public final class RestorePoints {

    private RestorePoints() {
    }

    public static RestorePointEntity create(String appId, String appName, String scope, String source, String includedAppIds, String path, String status, long sizeBytes, String message) {
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
