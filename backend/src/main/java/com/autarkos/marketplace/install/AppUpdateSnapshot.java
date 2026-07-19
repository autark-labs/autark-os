package com.autarkos.marketplace.install;

import java.time.Instant;

/** Immutable release checkpoint used for a managed update or rollback. */
public record AppUpdateSnapshot(
        String snapshotId,
        String appId,
        String appName,
        String operationKind,
        String fromVersion,
        String toVersion,
        String snapshotPath,
        Long safetyRestorePointId,
        String status,
        String message,
        Instant createdAt,
        Instant updatedAt) {
}
