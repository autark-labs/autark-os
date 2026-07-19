package com.autarkos.marketplace.install;

import java.time.Instant;

final class AppUpdateSnapshots {

    private AppUpdateSnapshots() {
    }

    static AppUpdateSnapshot toDomain(AppUpdateSnapshotEntity entity) {
        return new AppUpdateSnapshot(
                entity.snapshotId(),
                entity.appId(),
                entity.appName(),
                entity.operationKind(),
                entity.fromVersion(),
                entity.toVersion(),
                entity.snapshotPath(),
                entity.safetyRestorePointId(),
                entity.status(),
                entity.message(),
                instant(entity.createdAt()),
                instant(entity.updatedAt()));
    }

    private static Instant instant(String value) {
        try {
            return Instant.parse(value);
        } catch (RuntimeException exception) {
            return Instant.EPOCH;
        }
    }
}
