package com.autarkos.marketplace.install;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;

@Component
public class InstallCustomizationResolver {

    private static final List<String> BACKUP_FREQUENCIES = List.of("hourly", "daily", "weekly");

    private final PortAllocator portAllocator;

    public InstallCustomizationResolver(PortAllocator portAllocator) {
        this.portAllocator = portAllocator;
    }

    public RuntimeModels.ResolvedRuntimeConfiguration resolve(ApplicationManifest manifest, InstallOptionsRequest request) {
        InstallOptionsRequest options = request == null ? InstallOptionsRequest.defaults() : request;
        Map<String, List<String>> servicePorts = portAllocator.resolveServicePorts(manifest, options.ports());
        List<String> ports = servicePorts.values().stream().flatMap(List::stream).toList();
        String mode = accessMode(manifest, options.access());
        String accessUrl = portAllocator.accessUrl(manifest, ports);
        if (mode.equals("network") || mode.equals("local-and-private")) {
            accessUrl = com.autarkos.network.HostAddress.withHost(accessUrl, com.autarkos.network.HostAddress.lanAddress());
        }
        return new RuntimeModels.ResolvedRuntimeConfiguration(
                ports,
                servicePorts,
                accessUrl,
                null,
                storageSubfolders(options.storage()),
                storageHostPaths(options.storage()),
                mode.equals("private") || mode.equals("local-and-private"),
                backupPolicy(options.backup()),
                mode);
    }

    /** Keep the running app's peer bindings when changing its dashboard port. */
    public RuntimeModels.ResolvedRuntimeConfiguration resolveSettings(ApplicationManifest manifest, InstallOptionsRequest options, String compose) {
        var yaml = new org.yaml.snakeyaml.Yaml(new org.yaml.snakeyaml.constructor.SafeConstructor(new org.yaml.snakeyaml.LoaderOptions()));
        Object document = yaml.load(compose);
        if (!(document instanceof Map<?, ?> root) || !(root.get("services") instanceof Map<?, ?> services)) {
            throw new InstallationException("The existing app configuration cannot be read safely.");
        }
        Map<String, List<String>> existing = new LinkedHashMap<>();
        services.forEach((name, value) -> {
            if (!(value instanceof Map<?, ?> service)) throw new InstallationException("Invalid app service configuration.");
            Object mappings = service.get("ports");
            if (mappings == null) existing.put(name.toString(), List.of());
            else if (mappings instanceof List<?> list && list.stream().allMatch(String.class::isInstance)) {
                existing.put(name.toString(), list.stream().map(Object::toString).toList());
            } else throw new InstallationException("This app's port configuration needs a supported Compose template before editing.");
        });
        Map<String, List<String>> updated = new LinkedHashMap<>();
        Map<String, List<String>> declared = new LinkedHashMap<>();
        if (manifest.runtime().multiService()) manifest.runtime().services().forEach(service -> declared.put(service.name(), service.ports()));
        else declared.put(manifest.runtime().containerName(), manifest.runtime().ports());
        declared.forEach((service, mappings) -> {
            List<String> values = new java.util.ArrayList<>();
            for (String mapping : mappings) {
                String target = mapping.substring(mapping.lastIndexOf(':') + 1);
                String current = existing.getOrDefault(service, List.of()).stream()
                        .filter(port -> port.substring(port.lastIndexOf(':') + 1).equals(target)).findFirst().orElse(null);
                if (target.equals(PortAllocator.dashboardTarget(manifest)) && options.ports() != null && options.ports().hostPort() != null) {
                    int requested = options.ports().hostPort();
                    String[] parts = current == null ? new String[0] : current.split(":");
                    boolean samePort = parts.length >= 2 && parts[parts.length - 2].equals(Integer.toString(requested));
                    String selected = samePort ? requested + ":" + target
                            : portAllocator.resolveExplicitPort(mapping, requested);
                    values.add(selected);
                } else {
                    values.add(current == null ? portAllocator.resolveMapping(mapping) : current);
                }
            }
            updated.put(service, values);
        });
        String mode = accessMode(manifest, options.access());
        List<String> ports = updated.values().stream().flatMap(List::stream).toList();
        String url = portAllocator.accessUrl(manifest, ports);
        if (mode.equals("network") || mode.equals("local-and-private")) url = com.autarkos.network.HostAddress.withHost(url, com.autarkos.network.HostAddress.lanAddress());
        return new RuntimeModels.ResolvedRuntimeConfiguration(ports, updated, url, null,
                storageSubfolders(options.storage()), storageHostPaths(options.storage()),
                mode.equals("private") || mode.equals("local-and-private"), backupPolicy(options.backup()), mode);
    }

    public static String accessMode(ApplicationManifest manifest, InstallOptionsRequest.AccessOptions access) {
        String mode = access == null ? null : access.mode();
        if (mode == null || mode.isBlank()) {
            mode = manifest.access().privateDashboard() ? "private"
                    : access != null && Boolean.TRUE.equals(access.tailscaleEnabled()) ? "local-and-private" : "network";
        }
        if (!List.of("local", "network", "private", "local-and-private").contains(mode)) {
            throw new InstallationException("Choose this server, home network, or private access.");
        }
        if (manifest.access().privateDashboard() && (mode.equals("network") || mode.equals("local-and-private"))) {
            throw new InstallationException(manifest.name() + " dashboard must stay on this server or private Tailscale devices. Peer synchronization remains available on the home network.");
        }
        if (manifest.usage().privateHttpsRequired()) return "private";
        if (manifest.runtime().network().equalsIgnoreCase("host") && (mode.equals("local") || mode.equals("private"))) {
            throw new InstallationException("This app uses host networking and cannot enforce server-only dashboard access.");
        }
        return mode;
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

    private InstallModels.BackupPolicy backupPolicy(InstallOptionsRequest.BackupOptions backup) {
        if (backup == null) {
            return InstallModels.BackupPolicy.defaults();
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
        return new InstallModels.BackupPolicy(enabled, frequency, retention);
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
