package com.projectos.discover;

public record DiscoverInstalledAppSummary(
        String appId,
        String appName,
        String status,
        String accessUrl,
        String backupState,
        boolean protectedByBackups,
        boolean firstBackupRecommended) {

    public DiscoverInstalledAppSummary(String appId, String appName, String status, String accessUrl) {
        this(appId, appName, status, accessUrl, "backup_enabled_no_restore_point", false, true);
    }
}
