package com.autarkos.marketplace.install;

import com.autarkos.marketplace.api.InstallOptionsRequest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.autarkos.marketplace.model.ApplicationManifest;

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
                storageHostPaths(options.storage()),
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

    private Map<String, String> storageHostPaths(InstallOptionsRequest.StorageOptions storage) {
        if (storage == null || storage.hostPaths() == null || storage.hostPaths().isEmpty()) {
            return Map.of();
        }
        Map<String, String> safeHostPaths = new LinkedHashMap<>();
        storage.hostPaths().forEach((key, value) -> {
            String safeKey = safeName(key, "storage key");
            String path = hostPath(value);
            safeHostPaths.put(safeKey, path);
        });
        return safeHostPaths;
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
            throw new InstallationException("The " + label + " '" + value + "' is not a safe Autark-OS folder name.");
        }
        return normalized;
    }

    private String hostPath(String value) {
        if (value == null || value.isBlank()) {
            throw new InstallationException("A storage host path cannot be blank.");
        }
        Path path = Path.of(value.trim()).normalize();
        if (!path.isAbsolute()) {
            throw new InstallationException("Storage host paths must be absolute paths.");
        }
        if (!Files.isDirectory(path) || !Files.isReadable(path)) {
            throw new InstallationException("Storage host paths must point to readable folders.");
        }
        return path.toString();
    }
}
