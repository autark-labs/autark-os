package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.Map;

public record InstallSettings(
        String accessUrl,
        String privateAccessUrl,
        boolean tailscaleEnabled,
        Map<String, String> storageSubfolders,
        BackupPolicy backup,
        String desiredAccessMode,
        String privateAccessRequirement,
        Integer expectedLocalPort,
        String expectedProtocol,
        Instant lastAccessCheckAt,
        Instant lastSuccessfulAccessAt,
        Instant lastRepairAttemptAt,
        String lastRepairStatus,
        boolean autoRepairEnabled) {

    public InstallSettings(String accessUrl, String privateAccessUrl, boolean tailscaleEnabled, Map<String, String> storageSubfolders, BackupPolicy backup) {
        this(accessUrl, privateAccessUrl, tailscaleEnabled, storageSubfolders, backup, null, null, null, null, null, null, null, null, true);
    }

    public static InstallSettings defaults(String accessUrl) {
        return new InstallSettings(accessUrl, null, false, Map.of(), BackupPolicy.defaults(), "local", "optional", null, "http", null, null, null, null, true);
    }
}
