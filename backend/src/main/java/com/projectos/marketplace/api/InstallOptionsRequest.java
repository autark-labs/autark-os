package com.projectos.marketplace.api;

import java.util.Map;

public record InstallOptionsRequest(
        PortOptions ports,
        AccessOptions access,
        StorageOptions storage,
        BackupOptions backup,
        Boolean reinstall) {

    public InstallOptionsRequest(PortOptions ports, AccessOptions access, StorageOptions storage, BackupOptions backup) {
        this(ports, access, storage, backup, false);
    }

    public static InstallOptionsRequest defaults() {
        return new InstallOptionsRequest(null, null, null, null, false);
    }

    public boolean reinstallRequested() {
        return Boolean.TRUE.equals(reinstall);
    }

    public record PortOptions(Integer hostPort) {
    }

    public record AccessOptions(Boolean tailscaleEnabled) {
    }

    public record StorageOptions(Map<String, String> subfolders, Map<String, String> hostPaths) {
        public StorageOptions(Map<String, String> subfolders) {
            this(subfolders, Map.of());
        }
    }

    public record BackupOptions(Boolean enabled, String frequency, Integer retention) {
    }
}
