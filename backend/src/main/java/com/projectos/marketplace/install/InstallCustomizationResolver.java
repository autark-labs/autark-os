package com.projectos.marketplace.install;

import com.projectos.marketplace.api.InstallOptionsRequest;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.projectos.marketplace.model.ApplicationManifest;

@Component
public class InstallCustomizationResolver {

    private static final List<String> BACKUP_FREQUENCIES = List.of("hourly", "daily", "weekly");

    private final PortAllocator portAllocator;

    public InstallCustomizationResolver(PortAllocator portAllocator) {
        this.portAllocator = portAllocator;
    }

    public ResolvedRuntimeConfiguration resolve(ApplicationManifest manifest, InstallOptionsRequest request) {
        InstallOptionsRequest options = request == null ? InstallOptionsRequest.defaults() : request;
        Map<String, List<String>> servicePorts = portAllocator.resolveServicePorts(manifest, options.ports());
        List<String> ports = servicePorts.values().stream().flatMap(List::stream).toList();
        return new ResolvedRuntimeConfiguration(
                ports,
                servicePorts,
                portAllocator.accessUrl(manifest, ports),
                null,
                storageSubfolders(options.storage()),
                tailscaleEnabled(options.access()),
                backupPolicy(options.backup()));
    }

    private boolean tailscaleEnabled(InstallOptionsRequest.AccessOptions access) {
        return access != null && Boolean.TRUE.equals(access.tailscaleEnabled());
    }

    private Map<String, String> storageSubfolders(InstallOptionsRequest.StorageOptions storage) {
        if (storage == null || storage.subfolders() == null || storage.subfolders().isEmpty()) {
            return Map.of();
        }
        Map<String, String> safeSubfolders = new LinkedHashMap<>();
        storage.subfolders().forEach((key, value) -> {
            String safeKey = safeName(key, "storage key");
            String safeValue = safeName(value, "storage folder");
            safeSubfolders.put(safeKey, safeValue);
        });
        return safeSubfolders;
    }

    private BackupPolicy backupPolicy(InstallOptionsRequest.BackupOptions backup) {
        if (backup == null) {
            return BackupPolicy.defaults();
        }
        boolean enabled = backup.enabled() == null || backup.enabled();
        String frequency = backup.frequency() == null || backup.frequency().isBlank() ? "daily" : backup.frequency().trim().toLowerCase();
        if (!BACKUP_FREQUENCIES.contains(frequency)) {
            throw new InstallationException("Backup frequency must be hourly, daily, or weekly.");
        }
        int retention = backup.retention() == null ? 7 : backup.retention();
        if (retention < 1 || retention > 90) {
            throw new InstallationException("Backup retention must be between 1 and 90.");
        }
        return new BackupPolicy(enabled, frequency, retention);
    }

    private String safeName(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new InstallationException("A " + label + " cannot be blank.");
        }
        String normalized = value.trim();
        if (!normalized.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")) {
            throw new InstallationException("The " + label + " '" + value + "' is not a safe Project-OS folder name.");
        }
        return normalized;
    }
}
