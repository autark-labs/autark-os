package com.autarkos.testsupport;

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
}
