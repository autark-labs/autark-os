package com.autarkos.marketplace.api;

import java.util.Map;

public record InstallOptionsRequest(
        PortOptions ports,
        AccessOptions access,
        StorageOptions storage,
        BackupOptions backup,
        Boolean reinstall,
        Boolean duplicateAcknowledged) {

    public InstallOptionsRequest(PortOptions ports, AccessOptions access, StorageOptions storage, BackupOptions backup) {
        this(ports, access, storage, backup, false, false);
    }

    public InstallOptionsRequest(PortOptions ports, AccessOptions access, StorageOptions storage, BackupOptions backup, Boolean reinstall) {
        this(ports, access, storage, backup, reinstall, false);
    }

    public static InstallOptionsRequest defaults() {
        return new InstallOptionsRequest(null, null, null, null, false, false);
    }

    public boolean reinstallRequested() {
        return Boolean.TRUE.equals(reinstall);
    }

    public boolean duplicateAcknowledgedRequested() {
        return Boolean.TRUE.equals(duplicateAcknowledged);
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
