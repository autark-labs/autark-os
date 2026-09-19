package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import com.autarkos.host.DockerInventoryService;
import com.autarkos.host.DockerInventorySnapshot;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;

/** The single durable-data boundary used by every managed app operation. */
@Service
public class ManagedStorageContractService {

    public record Contract(InstalledApp app, Map<String, Path> protectedPaths) {
        public Contract {
            protectedPaths = Map.copyOf(protectedPaths);
        }
    }

    public record CleanupAssessment(boolean allowed, String reason, Map<String, Path> protectedPaths) {
    }

    private static final Comparator<RuntimeModels.ManagedMount> MOUNT_ORDER = Comparator
            .comparing(RuntimeModels.ManagedMount::service)
            .thenComparing(RuntimeModels.ManagedMount::destination)
            .thenComparing(RuntimeModels.ManagedMount::source);

    private final ManifestYamlReader manifestReader;
    private final ManifestValidator manifestValidator;
    private final DockerInventoryService dockerInventory;
    private final AppRuntimeMetadataReader metadataReader;

    public ManagedStorageContractService(
            ManifestYamlReader manifestReader,
            ManifestValidator manifestValidator,
            DockerInventoryService dockerInventory,
            AppRuntimeMetadataReader metadataReader) {
        this.manifestReader = manifestReader;
        this.manifestValidator = manifestValidator;
        this.dockerInventory = dockerInventory;
        this.metadataReader = metadataReader;
    }

    public Contract require(InstalledApp app, RuntimeModels.AppRuntimeMetadata metadata, boolean verifyLive) {
        Path appRoot = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        ApplicationManifest manifest = readManifest(appRoot);
        List<RuntimeModels.ManagedMount> composeMounts = readComposeMounts(appRoot.resolve("compose.yaml"));
        if (metadata.mountContract().isEmpty()) {
            throw blocked(app, "The saved mount contract is missing. Reinstall or recover this app before changing its data.");
        }
        if (!sameMounts(metadata.mountContract(), composeMounts)) {
            throw blocked(app, "The saved Compose storage no longer matches the installed mount contract.");
        }
        Map<String, Path> protectedPaths = protectedPaths(app, manifest, composeMounts, appRoot);
        if (verifyLive) {
            verifyLive(app, composeMounts);
        }
        return new Contract(app, protectedPaths);
    }

    /** Reads and validates the release manifest saved with an installed runtime. */
    public Optional<ApplicationManifest> findManifest(Path appRoot) {
        Path path = appRoot.resolve("manifest.yaml");
        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            ApplicationManifest manifest = manifestReader.read(new FileSystemResource(path));
            manifestValidator.validate(manifest);
            return Optional.of(manifest);
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    /** Reconstructs the persisted storage choices only when every declared mount is exact and safe. */
    public Optional<Map<String, String>> recoverySettings(
            ApplicationManifest manifest,
            List<RuntimeModels.ManagedMount> mounts,
            Path appRoot) {
        Map<String, String> actualByTarget = new LinkedHashMap<>();
        for (RuntimeModels.ManagedMount mount : mounts) {
            if (actualByTarget.put(mount.destination(), mount.source()) != null) {
                return Optional.empty();
            }
        }
        List<RuntimeModels.ManagedMount> declared = declaredMounts(manifest);
        if (actualByTarget.size() != declared.size()) {
            return Optional.empty();
        }
        Map<String, String> settings = new LinkedHashMap<>();
        for (RuntimeModels.ManagedMount expected : declared) {
            String actual = actualByTarget.get(expected.destination());
            if (actual == null) {
                return Optional.empty();
            }
            if (!expected.source().startsWith(manifest.runtime().runtimeRoot())) {
                if (!actual.equals(expected.source())) {
                    return Optional.empty();
                }
                continue;
            }
            String key = expected.source().substring(manifest.runtime().runtimeRoot().length()).replaceFirst("^/+", "");
            Path actualPath;
            try {
                actualPath = Path.of(actual).toAbsolutePath().normalize();
            } catch (RuntimeException exception) {
                return Optional.empty();
            }
            Path root = appRoot.toAbsolutePath().normalize();
            if (key.isBlank() || !actualPath.startsWith(root)) {
                return Optional.empty();
            }
            Path relative = root.relativize(actualPath);
            if (relative.getNameCount() != 1 || !relative.toString().matches("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")) {
                return Optional.empty();
            }
            settings.put(key, relative.toString());
        }
        return Optional.of(Map.copyOf(settings));
    }

    public static boolean sameMounts(
            List<RuntimeModels.ManagedMount> expected,
            List<RuntimeModels.ManagedMount> actual) {
        return normalized(expected).equals(normalized(actual));
    }

    public CleanupAssessment assessOrphan(Path appRoot) {
        return assessOrphan(appRoot, dockerInventory.requireFresh());
    }

    public Map<Path, CleanupAssessment> assessOrphans(List<Path> appRoots) {
        Map<Path, CleanupAssessment> assessments = new LinkedHashMap<>();
        DockerInventorySnapshot snapshot;
        try {
            snapshot = dockerInventory.requireFresh();
        } catch (RuntimeException exception) {
            appRoots.forEach(path -> assessments.put(path, new CleanupAssessment(
                    false,
                    "Docker is unavailable, so Autark-OS cannot prove this folder is unused.",
                    Map.of())));
            return Map.copyOf(assessments);
        }
        appRoots.forEach(path -> assessments.put(path, assessOrphan(path, snapshot)));
        return Map.copyOf(assessments);
    }

    private CleanupAssessment assessOrphan(Path appRoot, DockerInventorySnapshot snapshot) {
        String appId = appRoot.getFileName().toString();
        try {
            RuntimeModels.AppRuntimeMetadata metadata = metadataReader.read(appRoot)
                    .orElseThrow(() -> new InstallationException("Saved runtime metadata is missing."));
            if (!appId.equals(metadata.catalogAppId())) {
                throw new InstallationException("The folder and saved app identity do not match.");
            }
            if (!snapshot.currentInstanceId().equals(metadata.instanceId())) {
                throw new InstallationException("This data belongs to another Autark-OS installation.");
            }
            boolean hasContainers = snapshot.containers().stream()
                    .anyMatch(container -> appId.equals(container.classification().appId()));
            if (hasContainers) {
                throw new InstallationException("Containers still use this app data.");
            }
            InstalledApp app = new InstalledApp(
                    appId, appId, "found", appRoot.toString(), metadata.composeProject(), "", metadata.createdAt());
            Contract contract = require(app, metadata, false);
            return new CleanupAssessment(true, "Declared app data can be checkpointed before cleanup.",
                    contract.protectedPaths());
        } catch (RuntimeException exception) {
            String detail = exception.getMessage() == null || exception.getMessage().isBlank()
                    ? "The durable data layout could not be proven."
                    : exception.getMessage();
            return new CleanupAssessment(false, detail, Map.of());
        }
    }

    public static List<RuntimeModels.ManagedMount> readComposeMounts(Path composeFile) {
        if (!AppRuntimeFiles.isComposeFile(composeFile)) {
            return List.of();
        }
        try {
            return readMounts(composeServices(composeFile));
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof InstallationException installationException) {
                throw installationException;
            }
            throw new InstallationException("The saved Compose storage contract could not be read.", exception);
        }
    }

    private static Map<?, ?> composeServices(Path composeFile) throws IOException {
        Object document = new Yaml(new SafeConstructor(new LoaderOptions())).load(Files.readString(composeFile));
        if (!(document instanceof Map<?, ?> root) || !(root.get("services") instanceof Map<?, ?> services)) {
            return Map.of();
        }
        return services;
    }

    private static List<RuntimeModels.ManagedMount> readMounts(Map<?, ?> services) {
        List<RuntimeModels.ManagedMount> mounts = new ArrayList<>();
        services.forEach((serviceName, rawService) -> {
            if (!(rawService instanceof Map<?, ?> service) || !(service.get("volumes") instanceof List<?> volumes)) {
                return;
            }
            for (Object rawVolume : volumes) {
                if (!(rawVolume instanceof String volume)) {
                    throw new InstallationException("Managed Compose storage must use explicit source:destination mappings.");
                }
                String[] parts = volume.split(":", 3);
                if (parts.length < 2 || parts[0].isBlank() || parts[1].isBlank()) {
                    throw new InstallationException("Managed Compose storage contains an invalid mount mapping.");
                }
                String source = parts[0].startsWith("/")
                        ? Path.of(parts[0]).toAbsolutePath().normalize().toString()
                        : parts[0].trim();
                mounts.add(new RuntimeModels.ManagedMount(
                        serviceName.toString(),
                        source.startsWith("/") ? "bind" : "volume",
                        source,
                        parts[1].trim(),
                        parts.length == 3 && List.of(parts[2].split(",")).contains("ro")));
            }
        });
        return normalized(mounts);
    }

    private ApplicationManifest readManifest(Path appRoot) {
        return findManifest(appRoot).orElseThrow(() -> new InstallationException(
                "The saved app release manifest cannot prove the durable data layout. No data-changing action was performed."));
    }

    private List<RuntimeModels.ManagedMount> declaredMounts(ApplicationManifest manifest) {
        List<RuntimeModels.ManagedMount> mounts = new ArrayList<>();
        if (manifest.runtime().multiService()) {
            manifest.runtime().services().forEach(service -> service.volumes().forEach(mapping ->
                    mounts.add(declaredMount(service.name(), mapping))));
        } else {
            manifest.runtime().volumes().forEach(mapping ->
                    mounts.add(declaredMount(manifest.runtime().containerName(), mapping)));
        }
        return normalized(mounts);
    }

    private RuntimeModels.ManagedMount declaredMount(String service, String mapping) {
        String[] parts = mapping.split(":", 3);
        if (parts.length < 2 || parts[0].isBlank() || parts[1].isBlank()) {
            throw new InstallationException("The release manifest contains an invalid managed mount.");
        }
        return new RuntimeModels.ManagedMount(
                service,
                parts[0].startsWith("/") ? "bind" : "volume",
                parts[0],
                parts[1],
                parts.length == 3 && List.of(parts[2].split(",")).contains("ro"));
    }

    private Map<String, Path> protectedPaths(
            InstalledApp app,
            ApplicationManifest manifest,
            List<RuntimeModels.ManagedMount> mounts,
            Path appRoot) {
        Map<String, Path> protectedPaths = new LinkedHashMap<>();
        for (String backupPath : manifest.runtime().backupPaths()) {
            Path expected = appRoot.resolve(backupPath).normalize();
            if (!expected.startsWith(appRoot)) {
                throw blocked(app, "The release manifest contains an unsafe durable-data path.");
            }
            long matches = mounts.stream()
                    .filter(mount -> "bind".equals(mount.type()))
                    .filter(mount -> expected.equals(Path.of(mount.source()).toAbsolutePath().normalize()))
                    .count();
            if (matches != 1) {
                throw blocked(app, "Durable path '" + backupPath + "' is not backed by exactly one managed mount.");
            }
            protectedPaths.put(backupPath, expected);
        }
        return protectedPaths;
    }

    private void verifyLive(InstalledApp app, List<RuntimeModels.ManagedMount> expected) {
        DockerInventorySnapshot snapshot = dockerInventory.requireFresh();
        snapshot.requireMutationOwnership(app.appId());
        List<DockerInventorySnapshot.Container> containers = snapshot.ownedContainerEvidenceFor(app.appId(), app.composeProject());
        if (containers.isEmpty()) return;
        List<RuntimeModels.ManagedMount> actual = containers.stream().flatMap(container ->
                container.observed().mounts().stream().map(mount -> new RuntimeModels.ManagedMount(
                        container.runtimeStatus().service(), mount.type(),
                        "bind".equals(mount.type()) ? Path.of(mount.source()).toAbsolutePath().normalize().toString() : mount.source(),
                        mount.destination(), mount.readOnly()))).toList();
        if (!sameMounts(expected, actual)) {
            throw blocked(app, "A live container does not use its recorded durable storage. No data-changing action was performed.");
        }
    }

    private InstallationException blocked(InstalledApp app, String detail) {
        return new InstallationException(app.appName() + " storage could not be proven. " + detail);
    }

    private static List<RuntimeModels.ManagedMount> normalized(List<RuntimeModels.ManagedMount> mounts) {
        return mounts.stream().sorted(MOUNT_ORDER).toList();
    }
}
