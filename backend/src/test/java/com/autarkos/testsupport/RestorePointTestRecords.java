package com.autarkos.testsupport;

import java.time.Instant;

import com.autarkos.backups.BackupRepository;
import com.autarkos.backups.RestorePoint;
import com.autarkos.backups.RestorePoints;

public final class RestorePointTestRecords {

    private RestorePointTestRecords() {
    }

    public static RestorePoint record(
            BackupRepository repository,
            String appId,
            String appName,
            String scope,
            String source,
            String includedAppIds,
            String path,
            String status,
            long sizeBytes,
            String message) {
        return RestorePoints.toDomain(repository.save(RestorePoints.create(appId, appName, scope, source, includedAppIds, path, status, sizeBytes, message)));
    }

    public static RestorePoint recordVerified(
            BackupRepository repository,
            String appId,
            String appName,
            String scope,
            String source,
            String includedAppIds,
            String path,
            long sizeBytes,
            String message) {
        String baseline = "a".repeat(64);
        var entity = repository.save(RestorePoints.create(
                appId, appName, scope, source, includedAppIds, path, "completed", sizeBytes, message,
                baseline, "cold_file", 1));
        entity.updateVerification("verified", "Archive checksum matched the immutable baseline.", "high", Instant.now().toString());
        return RestorePoints.toDomain(repository.save(entity));
    }
}
