package com.autarkos.discover;

import com.autarkos.api.AutarkOsStates;

public record DiscoverInstalledAppSummary(
        String appId,
        String appName,
        String status,
        String accessUrl,
        String backupState,
        boolean protectedByBackups,
        boolean firstBackupRecommended) {

    public DiscoverInstalledAppSummary(String appId, String appName, String status, String accessUrl) {
        this(appId, appName, status, accessUrl, AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT, false, true);
    }
}
