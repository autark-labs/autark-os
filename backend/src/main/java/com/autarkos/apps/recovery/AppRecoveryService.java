package com.autarkos.apps.recovery;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.host.HostModels;
import com.autarkos.host.DockerInventoryService;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.install.AppAccessChecker;
import com.autarkos.marketplace.install.AppRuntimeMetadataReader;
import com.autarkos.marketplace.install.AppRuntimeMetadataWriter;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.RuntimeServiceManifest;
import com.autarkos.system.AutarkOsIdentity;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class AppRecoveryService {

    static final String CURRENT_INSTANCE_REGISTRATION_LOST = "current_instance_registration_lost";
    static final String INSUFFICIENT_EVIDENCE = "insufficient_evidence";

    private static final Pattern PUBLISHED_PORT = Pattern.compile("(?:^|:)(\\d+):\\d+(?:/(?:tcp|udp))?$");

    private final ObservedServiceService observedServices;
    private final InstalledAppRepository installedApps;
    private final MarketplaceCatalogService catalog;
    private final AppRuntimeMetadataReader runtimeMetadataReader;
    private final DockerOwnershipService dockerOwnership;
    private final ActivityLogService activityLog;
    private final RecoveryOperationCoordinator recoveryOperations;
    private final AppAccessChecker accessChecker;
    private final DockerInventoryService dockerInventory;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AppRecoveryService(
            ObservedServiceService observedServices,
            InstalledAppRepository installedApps,
            MarketplaceCatalogService catalog,
            AppRuntimeMetadataReader runtimeMetadataReader,
            DockerOwnershipService dockerOwnership,
            ActivityLogService activityLog,
            RecoveryOperationCoordinator recoveryOperations,
            AppAccessChecker accessChecker,
            DockerInventoryService dockerInventory) {
        this.observedServices = observedServices;
        this.installedApps = installedApps;
        this.catalog = catalog;
        this.runtimeMetadataReader = runtimeMetadataReader;
        this.dockerOwnership = dockerOwnership;
        this.activityLog = activityLog;
        this.recoveryOperations = recoveryOperations;
        this.accessChecker = accessChecker;
        this.dockerInventory = dockerInventory;
    }

    public AppRecoveryModels.RecoveryPlan plan(String appId) {
        observedServices.refresh(dockerInventory.requireFresh());
        return buildPlan(appId, strictDockerEvidence(appId, observedServices.observedServices()));
    }

    public Optional<AppRecoveryModels.RecoveryPlan> applicablePlan(
            String appId,
            List<ObservedService> evidence) {
        List<ObservedService> containers = strictDockerEvidence(appId, evidence);
        boolean currentRuntimeObserved = containers.stream().anyMatch(service ->
                "owned_managed".equals(service.ownershipState())
                        && dockerOwnership.currentIdentity().instanceId().equals(service.autarkOsInstanceId()));
        if (!currentRuntimeObserved && installedApps.findAppById(appId).isEmpty()) {
            return Optional.empty();
        }
        AppRecoveryModels.RecoveryPlan plan = buildPlan(appId, containers);
        return plan.applicable() ? Optional.of(plan) : Optional.empty();
    }

    private AppRecoveryModels.RecoveryPlan buildPlan(String appId, List<ObservedService> containers) {
        ApplicationManifest manifest = catalog.findById(appId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown catalog application: " + appId));
        ObservedService evidence = containers.stream().findFirst().orElse(null);
        AutarkOsIdentity identity = dockerOwnership.currentIdentity();
        Path runtimePath = runtimePath(appId, evidence, identity);
        Optional<RuntimeModels.AppRuntimeMetadata> metadata = runtimeMetadataReader.read(runtimePath);
        String reason = reasonFor(appId, evidence, metadata.orElse(null), identity);
        Optional<ApplicationManifest> savedManifest = readSavedManifest(runtimePath);
        ApplicationManifest deployedManifest = savedManifest.orElse(manifest);
        ComposeInspection compose = inspectCompose(runtimePath.resolve("compose.yaml"), deployedManifest, runtimePath);
        List<AppRecoveryModels.RecoveryCheck> checks = new ArrayList<>();

        boolean catalogIdentity = (evidence == null || appId.equals(evidence.catalogAppId()))
                && metadata.map(value -> appId.equals(value.catalogAppId())).orElse(false)
                && savedManifest.map(value -> appId.equals(value.id())).orElse(false);
        checks.add(check("catalog_identity", "App identity", catalogIdentity,
                catalogIdentity ? manifest.name() + " matches Docker, runtime metadata, and the saved release manifest."
                        : "Catalog identity could not be proven from Docker, runtime metadata, and the saved release manifest.",
                evidence == null ? "No matching Docker evidence." : "Docker match: " + blank(evidence.catalogMatchConfidence(), "unknown")));

        boolean releaseManifestReady = savedManifest.isPresent()
                && metadata.map(value -> value.manifestVersion() == null || value.manifestVersion().isBlank()
                        || value.manifestVersion().equals(savedManifest.orElseThrow().version())).orElse(false);
        checks.add(check("release_manifest", "Saved app release", releaseManifestReady,
                releaseManifestReady
                        ? "The app's original validated release manifest is available."
                        : "The saved app release is missing, invalid, or does not match runtime metadata.",
                savedManifest.map(value -> "Version " + blank(value.version(), "unknown")).orElse("No valid manifest.yaml")));

        String appInstanceId = metadata.map(RuntimeModels.AppRuntimeMetadata::appInstanceId).orElse("");
        Set<String> observedInstanceIds = containers.stream().map(service -> metadataValue(service, "appInstanceId"))
                .filter(value -> !value.isBlank()).collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        boolean instanceIdentity = !appInstanceId.isBlank()
                && (observedInstanceIds.isEmpty() || observedInstanceIds.equals(Set.of(appInstanceId)));
        checks.add(check("app_instance_identity", "App instance", instanceIdentity,
                instanceIdentity ? "App-instance identity is consistent." : "App-instance identity is missing or inconsistent.",
                blank(appInstanceId, "No app-instance ID found")));

        boolean runtimeSafe = safeRuntimePath(runtimePath, identity, appId) && Files.isDirectory(runtimePath);
        checks.add(check("runtime_path", "Runtime storage", runtimeSafe,
                runtimeSafe ? "The runtime folder is inside managed Autark-OS storage."
                        : "The runtime folder is missing or outside managed Autark-OS storage.", runtimePath.toString()));

        checks.add(check("compose", "Compose configuration", compose.valid(), compose.message(), runtimePath.resolve("compose.yaml").toString()));
        checks.add(check("mounts", "Saved data layout", compose.mountsValid(), compose.mountMessage(), String.join(", ", compose.mounts())));

        LiveRuntimeInspection liveRuntime = inspectLiveRuntime(containers, compose, deployedManifest);
        checks.add(check("live_runtime", "Running containers", liveRuntime.valid(), liveRuntime.message(), liveRuntime.detail()));

        boolean ownershipConsistent = ownershipConsistent(appId, containers, metadata.orElse(null), identity);
        checks.add(check("ownership", "Current ownership", ownershipConsistent,
                ownershipConsistent ? "The saved runtime and current-instance evidence identify this Autark-OS installation."
                        : "Current-instance ownership could not be proven without using legacy or foreign resources.",
                containers.stream().map(ObservedService::fingerprint).collect(java.util.stream.Collectors.joining(", "))));

        Set<Integer> conflicts = portConflicts(appId, compose.ports());
        checks.add(check("ports", "Published ports", conflicts.isEmpty(),
                conflicts.isEmpty() ? "The app's published ports have no conflict." : "Another service claims: " + conflicts,
                compose.ports().isEmpty() ? "No published ports" : compose.ports().toString()));

        Optional<InstallModels.InstallSettings> resolvedSettings = recoverySettings(appId, deployedManifest, evidence, compose, runtimePath);
        boolean settingsReady = resolvedSettings.isPresent();
        checks.add(check("settings", "Managed settings", settingsReady,
                settingsReady ? installedApps.settingsFor(appId).isPresent()
                        ? "The original app settings are available."
                        : "Access and storage settings were reconstructed from the verified runtime."
                        : "Autark-OS cannot reconstruct complete app settings without guessing.",
                settingsReady ? "Settings are ready for the managed lifecycle." : "Existing resources remain unchanged."));

        String composeProject = firstPresent(
                metadata.map(RuntimeModels.AppRuntimeMetadata::composeProject).orElse(""),
                metadataValue(evidence, "composeProject"));
        String expectedComposeProject = dockerOwnership.composeProject(appId);
        boolean composeProjectsReady = !composeProject.isBlank() && composeProject.equals(expectedComposeProject);
        checks.add(check("compose_project", "Compose ownership", composeProjectsReady,
                composeProjectsReady
                        ? "The Compose project belongs to this Autark-OS installation."
                        : "The recorded Compose project does not match this Autark-OS installation.",
                composeProjectsReady ? composeProject : "No matching current-instance project identity"));
        boolean lifecycleAvailable = CURRENT_INSTANCE_REGISTRATION_LOST.equals(reason)
                && checks.stream().allMatch(item -> "passed".equals(item.status()));
        checks.add(check("managed_lifecycle", "Complete managed lifecycle", lifecycleAvailable,
                lifecycleAvailable ? "Recovery will enable start, stop, restart, repair, settings, backup, update, and uninstall."
                        : "A complete managed lifecycle cannot be guaranteed from the current evidence.",
                lifecycleAvailable ? "Ready for reviewed recovery." : "Existing resources remain unchanged."));

        List<String> blocked = checks.stream().filter(item -> "blocked".equals(item.status()))
                .map(AppRecoveryModels.RecoveryCheck::message).distinct().toList();
        boolean applicable = blocked.isEmpty();
        String summary = applicable
                ? "Autark-OS can restore this installation's missing registration without changing the app runtime or data."
                : "These resources will remain unchanged because complete current-instance recovery proof is unavailable.";
        String planId = planId(appId, reason, runtimePath, composeProject,
                appInstanceId, containers, resolvedSettings.orElse(null));
        return new AppRecoveryModels.RecoveryPlan(
                appId, manifest.name(), reason, applicable, summary, planId,
                runtimePath.toString(), composeProject, appInstanceId,
                containers.stream().map(ObservedService::fingerprint).toList(), compose.mounts(),
                compose.ports().stream().map(String::valueOf).toList(), List.copyOf(checks),
                List.of("Re-read current-instance evidence", "Restore the missing managed registration",
                        "Refresh canonical application state"),
                blocked);
    }

    public boolean reviewedPlanMatches(AppRecoveryModels.RecoveryPlan plan, AppRecoveryModels.RecoveryApplyRequest request) {
        return request != null && request.planId() != null && request.planId().equals(plan.planId());
    }

    public void apply(String appId, AppRecoveryModels.RecoveryApplyRequest request) {
        apply(appId, request, ignored -> { });
    }

    public void apply(
            String appId,
            AppRecoveryModels.RecoveryApplyRequest request,
            Consumer<String> progress) {
        Consumer<String> sink = progress == null ? ignored -> { } : progress;
        recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.APP_RECOVERY,
                () -> {
                    applyLocked(appId, request, sink);
                    return null;
                });
    }

    private void applyLocked(
            String appId,
            AppRecoveryModels.RecoveryApplyRequest request,
            Consumer<String> progress) {
        progress.accept("inspect_current_state");
        observedServices.refresh(dockerInventory.requireFresh());
        List<ObservedService> evidence = strictDockerEvidence(appId, observedServices.observedServices());
        AppRecoveryModels.RecoveryPlan plan = buildPlan(appId, evidence);
        if (!plan.applicable()) {
            throw new InstallationException("Recovery is not safe yet. " + String.join(" ", plan.blockedReasons()));
        }
        if (request == null || request.planId() == null || !request.planId().equals(plan.planId())) {
            throw new InstallationException("The app changed after this recovery plan was reviewed. Review a fresh plan before continuing.");
        }
        Path runtimePath = Path.of(plan.runtimePath()).toAbsolutePath().normalize();
        Path composePath = runtimePath.resolve("compose.yaml");
        ApplicationManifest manifest = readSavedManifest(runtimePath)
                .orElseThrow(() -> new InstallationException("The app's saved release manifest is no longer available."));
        InstallModels.InstallSettings settings = recoverySettings(appId, manifest, evidence.stream().findFirst().orElse(null),
                inspectCompose(composePath, manifest, runtimePath), runtimePath)
                .orElseThrow(() -> new InstallationException("The verified app settings are no longer available."));

        progress.accept("verify_recovery");
        progress.accept("commit_management");
        boolean running = evidence.stream().anyMatch(this::running);
        commitManagedRecords(plan, manifest, settings, Instant.now(),
                running ? AutarkOsStates.AppStatus.READY : AutarkOsStates.AppStatus.STOPPED);
        installedApps.recordEvent(plan.appId(), "app_recovered", "Autark-OS restored the missing app registration.");
        activityLog.success("applications", "app_recovered", "App recovery completed",
                manifest.name() + " is fully managed by this Autark-OS installation.", plan.appId());
    }

    private void commitManagedRecords(
            AppRecoveryModels.RecoveryPlan plan,
            ApplicationManifest manifest,
            InstallModels.InstallSettings settings,
            Instant now,
            String status) {
        InstalledApp app = new InstalledApp(plan.appId(), manifest.name(), status,
                plan.runtimePath(), plan.composeProject(), settings.accessUrl(), now);
        RuntimeModels.InstalledAppOwnershipMetadata ownership = new RuntimeModels.InstalledAppOwnershipMetadata(
                plan.appId(), plan.appInstanceId(), plan.appId(), dockerOwnership.currentIdentity().instanceId(),
                plan.runtimePath(), "ready", "owned", now, now);
        installedApps.commitRecoveredApp(app, settings, ownership);
    }

    private Optional<InstallModels.InstallSettings> recoverySettings(
            String appId,
            ApplicationManifest manifest,
            ObservedService evidence,
            ComposeInspection compose,
            Path runtimePath) {
        Optional<InstallModels.InstallSettings> stored = installedApps.settingsFor(appId);
        if (stored.isPresent()) return stored;
        if (!compose.valid() || !compose.mountsValid()) return Optional.empty();
        Map<String, String> storage = storageSettings(manifest, compose.mounts(), runtimePath);
        if (storage == null) return Optional.empty();
        Integer localPort = compose.ports().stream().findFirst().orElse(null);
        String observedUrl = evidence == null ? "" : blank(evidence.url(), "");
        String accessUrl = accessUrl(observedUrl, localPort);
        if (accessUrl.isBlank() && localPort != null) accessUrl = "http://localhost:" + localPort;
        boolean browserAccessRequired = accessChecker == null || accessChecker.shouldCheckLocalAccess(manifest, accessUrl);
        if (browserAccessRequired && accessUrl.isBlank()) return Optional.empty();
        boolean privateAccess = manifest.usage().privateHttpsRequired()
                || (evidence != null && blank(evidence.accessScope(), "").toLowerCase(Locale.ROOT).contains("private"));
        String mode = privateAccess ? "private" : loopback(accessUrl) ? "local" : "network";
        return Optional.of(new InstallModels.InstallSettings(
                accessUrl.isBlank() ? null : accessUrl, null, privateAccess, storage,
                InstallModels.BackupPolicy.defaults(), mode,
                manifest.usage().privateHttpsRequired() ? "required" : "optional", localPort,
                protocol(accessUrl), null, null, null, null, true));
    }

    private Map<String, String> storageSettings(
            ApplicationManifest manifest,
            List<String> observedMounts,
            Path runtimePath) {
        Map<String, String> actualByTarget = new LinkedHashMap<>();
        for (String mapping : observedMounts) {
            Mount mount = mount(mapping);
            if (mount == null || actualByTarget.put(mount.target(), mount.source()) != null) return null;
        }
        List<Mount> expectedMounts = declaredVolumes(manifest).stream().map(this::mount).toList();
        if (expectedMounts.stream().anyMatch(java.util.Objects::isNull)
                || actualByTarget.size() != expectedMounts.size()) return null;
        Map<String, String> settings = new LinkedHashMap<>();
        for (Mount expected : expectedMounts) {
            String actual = actualByTarget.get(expected.target());
            if (actual == null) return null;
            if (!expected.source().startsWith(manifest.runtime().runtimeRoot())) {
                if (!actual.equals(expected.source())) return null;
                continue;
            }
            String key = expected.source().substring(manifest.runtime().runtimeRoot().length()).replaceFirst("^/+", "");
            if (key.isBlank() || actual == null || !actual.startsWith("/")) return null;
            Path actualPath = Path.of(actual).toAbsolutePath().normalize();
            if (!actualPath.startsWith(runtimePath)) return null;
            Path relative = runtimePath.relativize(actualPath);
            if (relative.getNameCount() != 1 || !relative.toString().matches("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")) return null;
            settings.put(key, relative.toString());
        }
        return Map.copyOf(settings);
    }

    private List<String> declaredVolumes(ApplicationManifest manifest) {
        if (!manifest.runtime().multiService()) return manifest.runtime().volumes();
        return manifest.runtime().services().stream().flatMap(service -> service.volumes().stream()).distinct().toList();
    }

    private List<ObservedService> strictDockerEvidence(String appId, List<ObservedService> evidence) {
        return evidence.stream()
                .filter(service -> HostModels.ObservedServiceSource.DOCKER.equals(service.source()))
                .filter(service -> appId.equals(service.catalogAppId()))
                .sorted(Comparator.comparingInt(service -> "owned_managed".equals(service.ownershipState()) ? 0 : 1))
                .toList();
    }

    private String reasonFor(
            String appId,
            ObservedService evidence,
            RuntimeModels.AppRuntimeMetadata metadata,
            AutarkOsIdentity identity) {
        if (metadata == null || !appId.equals(metadata.catalogAppId())
                || !identity.instanceId().equals(metadata.instanceId())
                || metadata.appInstanceId() == null || metadata.appInstanceId().isBlank()) {
            return INSUFFICIENT_EVIDENCE;
        }
        return ownershipConsistent(appId, evidence == null ? List.of() : List.of(evidence), metadata, identity)
                ? CURRENT_INSTANCE_REGISTRATION_LOST
                : INSUFFICIENT_EVIDENCE;
    }

    private boolean ownershipConsistent(
            String appId,
            List<ObservedService> containers,
            RuntimeModels.AppRuntimeMetadata metadata,
            AutarkOsIdentity identity) {
        if (metadata == null || !appId.equals(metadata.catalogAppId())
                || !identity.instanceId().equals(metadata.instanceId())) {
            return false;
        }
        boolean storedOwnership = installedApps.ownershipFor(appId)
                .filter(ownership -> "owned".equalsIgnoreCase(ownership.ownershipStatus()))
                .filter(ownership -> appId.equals(ownership.catalogAppId()))
                .filter(ownership -> identity.instanceId().equals(ownership.autarkOsInstanceId()))
                .filter(ownership -> metadata.appInstanceId().equals(ownership.appInstanceId()))
                .isPresent();
        if (containers.isEmpty()) {
            return storedOwnership;
        }
        boolean liveOwnership = containers.stream().allMatch(service ->
                "owned_managed".equals(service.ownershipState())
                        && identity.instanceId().equals(service.autarkOsInstanceId())
                        && metadata.appInstanceId().equals(metadataValue(service, "appInstanceId")));
        return storedOwnership || liveOwnership;
    }

    private Path runtimePath(String appId, ObservedService evidence, AutarkOsIdentity identity) {
        String recorded = firstPresent(metadataValue(evidence, "runtimePath"), metadataValue(evidence, "dataPaths"));
        try {
            return Path.of(recorded.isBlank() ? identity.runtimeRoot() + "/apps/" + appId : recorded).toAbsolutePath().normalize();
        } catch (RuntimeException exception) {
            return Path.of(identity.runtimeRoot(), "apps", appId).toAbsolutePath().normalize();
        }
    }

    private boolean safeRuntimePath(Path path, AutarkOsIdentity identity, String appId) {
        try {
            Path apps = Path.of(identity.runtimeRoot()).toAbsolutePath().normalize().resolve("apps");
            Path expected = apps.resolve(appId).normalize();
            if (identity.runtimeRoot().isBlank() || !path.equals(expected)) return false;
            return !Files.exists(path) || path.toRealPath().startsWith(apps.toRealPath());
        } catch (IOException | RuntimeException exception) {
            return false;
        }
    }

    private ComposeInspection inspectCompose(Path composePath, ApplicationManifest manifest, Path runtimePath) {
        if (!Files.isRegularFile(composePath)) return ComposeInspection.invalid("The original Compose file is missing.");
        try {
            Object document = new Yaml(new SafeConstructor(new LoaderOptions())).load(Files.readString(composePath));
            if (!(document instanceof Map<?, ?> root) || !(root.get("services") instanceof Map<?, ?> services) || services.isEmpty()) {
                return ComposeInspection.invalid("The Compose file has no readable services.");
            }
            Set<String> expectedServices = expectedServices(manifest);
            Set<String> actualServices = services.keySet().stream().map(String::valueOf)
                    .collect(java.util.stream.Collectors.toSet());
            if (!actualServices.equals(expectedServices)) {
                return ComposeInspection.invalid("The Compose file does not exactly match the saved app release's services.");
            }
            Map<String, String> expectedImages = expectedImages(manifest);
            List<String> mounts = new ArrayList<>();
            Set<Integer> ports = new LinkedHashSet<>();
            boolean mountsValid = true;
            for (var entry : services.entrySet()) {
                Object serviceValue = entry.getValue();
                if (!(serviceValue instanceof Map<?, ?> service)) return ComposeInspection.invalid("The Compose file contains an invalid service definition.");
                String serviceName = String.valueOf(entry.getKey());
                if (!expectedImages.get(serviceName).equals(String.valueOf(service.get("image")))) {
                    return ComposeInspection.invalid("A Compose image does not match the saved app release.");
                }
                Object volumesValue = service.get("volumes");
                if (volumesValue != null && !(volumesValue instanceof List<?>)) mountsValid = false;
                if (volumesValue instanceof List<?> volumes) {
                    for (Object volume : volumes) {
                        if (!(volume instanceof String mapping) || !validMount(mapping)) mountsValid = false;
                        else mounts.add(mapping);
                    }
                }
                Object portsValue = service.get("ports");
                if (portsValue != null && !(portsValue instanceof List<?>)) return ComposeInspection.invalid("The Compose file contains an unsupported port definition.");
                if (portsValue instanceof List<?> mappings) {
                    for (Object value : mappings) {
                        Integer published = publishedPort(String.valueOf(value));
                        if (published == null) return ComposeInspection.invalid("The Compose file contains an unsupported port mapping.");
                        ports.add(published);
                    }
                }
            }
            if (mountsValid && storageSettings(manifest, mounts, runtimePath) == null) mountsValid = false;
            return new ComposeInspection(true, "The Compose file matches the catalog app.", mountsValid,
                    mountsValid ? "Mounted data can be preserved as managed storage."
                            : "A mounted data path cannot be represented safely by managed app settings.",
                    List.copyOf(mounts), Set.copyOf(ports));
        } catch (IOException | RuntimeException exception) {
            return ComposeInspection.invalid("The Compose file could not be parsed safely.");
        }
    }

    private Optional<ApplicationManifest> readSavedManifest(Path runtimePath) {
        Path path = runtimePath.resolve("manifest.yaml");
        if (!Files.isRegularFile(path)) return Optional.empty();
        try {
            ApplicationManifest manifest = new ManifestYamlReader().read(new FileSystemResource(path));
            new ManifestValidator().validate(manifest);
            return Optional.of(manifest);
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    private Set<String> expectedServices(ApplicationManifest manifest) {
        if (manifest.runtime().multiService()) {
            return manifest.runtime().services().stream().map(RuntimeServiceManifest::name).collect(java.util.stream.Collectors.toSet());
        }
        return Set.of(manifest.runtime().containerName());
    }

    private Map<String, String> expectedImages(ApplicationManifest manifest) {
        Map<String, String> images = new LinkedHashMap<>();
        if (manifest.runtime().multiService()) {
            manifest.runtime().services().forEach(service -> images.put(service.name(), service.image()));
        } else {
            images.put(manifest.runtime().containerName(), manifest.runtime().image());
        }
        return Map.copyOf(images);
    }

    private boolean validMount(String mapping) {
        Mount mount = mount(mapping);
        if (mount == null || !mount.target().startsWith("/")) return false;
        return !mount.source().startsWith(".") && (!mount.source().startsWith("/") || Path.of(mount.source()).isAbsolute());
    }

    private Mount mount(String mapping) {
        if (mapping == null) return null;
        String[] parts = mapping.split(":");
        if (parts.length < 2) return null;
        int targetIndex = parts.length > 2 && Set.of("ro", "rw").contains(parts[parts.length - 1]) ? parts.length - 2 : parts.length - 1;
        if (targetIndex != 1) return null;
        boolean readOnly = parts.length > 2 && "ro".equals(parts[parts.length - 1]);
        return new Mount(parts[0], parts[targetIndex], readOnly);
    }

    private Integer publishedPort(String mapping) {
        String normalized = mapping.replace("0.0.0.0:", "").replace("127.0.0.1:", "");
        Matcher matcher = PUBLISHED_PORT.matcher(normalized);
        if (!matcher.find()) return null;
        try {
            int port = Integer.parseInt(matcher.group(1));
            return port > 0 && port <= 65535 ? port : null;
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Set<Integer> portConflicts(String appId, Set<Integer> plannedPorts) {
        Set<Integer> conflicts = new LinkedHashSet<>();
        observedServices.observedServices().stream().filter(service -> !appId.equals(service.catalogAppId()))
                .map(service -> metadataValue(service, "ports")).flatMap(value -> portValues(value).stream())
                .filter(plannedPorts::contains).forEach(conflicts::add);
        return conflicts;
    }

    private Set<Integer> portValues(String value) {
        Set<Integer> ports = new LinkedHashSet<>();
        if (value == null) return ports;
        Matcher matcher = Pattern.compile("(?::|^)(\\d+)->").matcher(value);
        while (matcher.find()) {
            try {
                ports.add(Integer.parseInt(matcher.group(1)));
            } catch (NumberFormatException ignored) {
                // Ignore malformed observations; Compose validation remains authoritative.
            }
        }
        return ports;
    }

    private String planId(
            String appId,
            String reason,
            Path runtimePath,
            String composeProject,
            String appInstanceId,
            List<ObservedService> containers,
            InstallModels.InstallSettings settings) {
        List<String> evidence = containers.stream().map(service -> String.join(":",
                        blank(service.fingerprint(), ""), blank(service.ownershipState(), ""),
                        blank(service.autarkOsInstanceId(), ""), blank(service.runtimeState(), ""),
                        metadataValue(service, "appInstanceId"), metadataValue(service, "image"),
                        metadataValue(service, "composeService"), liveMountMaterial(service)))
                .sorted().toList();
        String material = String.join("|", appId, reason, runtimePath.toString(), composeProject,
                appInstanceId, fileHash(runtimePath.resolve("compose.yaml")),
                fileHash(runtimePath.resolve("manifest.yaml")),
                fileHash(runtimePath.resolve(AppRuntimeMetadataWriter.METADATA_FILE)), String.join(",", evidence), json(settings));
        return "recovery_" + sha256(material);
    }

    private LiveRuntimeInspection inspectLiveRuntime(
            List<ObservedService> containers,
            ComposeInspection compose,
            ApplicationManifest manifest) {
        if (!compose.valid()) {
            return LiveRuntimeInspection.invalid("Running container configuration cannot be verified until Compose evidence is complete.");
        }
        if (containers.isEmpty()) {
            return new LiveRuntimeInspection(
                    true,
                    "No app containers are present; the restored registration will keep the app stopped.",
                    "Runtime files and stored current-instance ownership are complete.");
        }
        List<String> expectedServices = expectedServices(manifest).stream().sorted().toList();
        List<String> actualServices = containers.stream()
                .map(service -> metadataValue(service, "composeService"))
                .sorted().toList();
        if (!actualServices.equals(expectedServices)) {
            return LiveRuntimeInspection.invalid("The running containers do not exactly match the saved app services.");
        }
        List<String> expectedImages = expectedImages(manifest).values().stream().sorted().toList();
        List<String> actualImages = containers.stream()
                .map(service -> metadataValue(service, "image"))
                .sorted().toList();
        if (!actualImages.equals(expectedImages)) {
            return LiveRuntimeInspection.invalid("A running container image does not match the saved app release.");
        }
        List<String> expectedMounts = compose.mounts().stream()
                .map(this::mount)
                .filter(java.util.Objects::nonNull)
                .map(this::mountSignature)
                .sorted().toList();
        List<String> actualMounts = new ArrayList<>();
        for (ObservedService container : containers) {
            Optional<List<Mount>> mounts = liveMounts(container);
            if (mounts.isEmpty()) {
                return LiveRuntimeInspection.invalid("Docker did not provide complete live mount details for every app container.");
            }
            mounts.orElseThrow().stream().map(this::mountSignature).forEach(actualMounts::add);
        }
        actualMounts.sort(String::compareTo);
        if (!actualMounts.equals(expectedMounts)) {
            return LiveRuntimeInspection.invalid("The running container mounts differ from the saved app configuration. Existing data will not be changed.");
        }
        return new LiveRuntimeInspection(
                true,
                "The running containers, images, and mounted data match the saved app release.",
                containers.size() + " container(s), " + actualMounts.size() + " mounted data path(s)");
    }

    private Optional<List<Mount>> liveMounts(ObservedService service) {
        try {
            JsonNode metadata = objectMapper.readTree(service.metadataJson());
            JsonNode mounts = metadata == null ? null : metadata.get("liveMounts");
            if (mounts == null || !mounts.isArray()) return Optional.empty();
            List<Mount> values = new ArrayList<>();
            for (JsonNode mount : mounts) {
                String source = mount.path("source").asText("");
                String target = mount.path("target").asText("");
                if (!"bind".equals(mount.path("type").asText(""))
                        || source.isBlank() || !source.startsWith("/")
                        || target.isBlank() || !target.startsWith("/")) {
                    return Optional.empty();
                }
                values.add(new Mount(source, target, mount.path("readOnly").asBoolean(false)));
            }
            return Optional.of(List.copyOf(values));
        } catch (IOException | RuntimeException exception) {
            return Optional.empty();
        }
    }

    private String liveMountMaterial(ObservedService service) {
        return liveMounts(service)
                .map(mounts -> mounts.stream().map(this::mountSignature).sorted()
                        .collect(java.util.stream.Collectors.joining(",")))
                .orElse("unavailable");
    }

    private String mountSignature(Mount mount) {
        String source;
        try {
            source = Path.of(mount.source()).toAbsolutePath().normalize().toString();
        } catch (RuntimeException exception) {
            source = mount.source();
        }
        return source + "|" + mount.target() + "|" + (mount.readOnly() ? "ro" : "rw");
    }

    private String fileHash(Path path) {
        try {
            return Files.isRegularFile(path) ? sha256(Files.readString(path)) : "missing";
        } catch (IOException exception) {
            return "unreadable";
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (IOException exception) {
            return String.valueOf(value);
        }
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : digest) result.append(String.format("%02x", item));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private AppRecoveryModels.RecoveryCheck check(String id, String label, boolean passed, String message, String detail) {
        return new AppRecoveryModels.RecoveryCheck(id, label, passed ? "passed" : "blocked", message, blank(detail, "No detail"));
    }

    private String metadataValue(ObservedService service, String key) {
        if (service == null || service.metadataJson() == null || service.metadataJson().isBlank()) return "";
        try {
            JsonNode value = objectMapper.readTree(service.metadataJson()).path(key);
            return value.isMissingNode() || value.isNull() ? "" : value.asText("").trim();
        } catch (IOException | RuntimeException exception) {
            return "";
        }
    }

    private String accessUrl(String observedUrl, Integer port) {
        if (observedUrl == null || observedUrl.isBlank()) return "";
        try {
            URI uri = URI.create(observedUrl);
            if (port == null || uri.getPort() == port) return observedUrl;
        } catch (IllegalArgumentException ignored) {
            // The published Compose port remains authoritative.
        }
        return port == null ? "" : "http://localhost:" + port;
    }

    private boolean loopback(String accessUrl) {
        try {
            String host = URI.create(accessUrl).getHost();
            return "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host);
        } catch (RuntimeException exception) {
            return true;
        }
    }

    private String protocol(String accessUrl) {
        try {
            return "https".equalsIgnoreCase(URI.create(accessUrl).getScheme()) ? "https" : "http";
        } catch (RuntimeException exception) {
            return "http";
        }
    }

    private boolean running(ObservedService service) {
        String state = blank(service.runtimeState(), "").toLowerCase(Locale.ROOT);
        return state.equals("running") || state.startsWith("up");
    }

    private String firstPresent(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value.trim();
        return "";
    }

    private String blank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private record ComposeInspection(
            boolean valid,
            String message,
            boolean mountsValid,
            String mountMessage,
            List<String> mounts,
            Set<Integer> ports) {

        private static ComposeInspection invalid(String message) {
            return new ComposeInspection(false, message, false,
                    "Mount mappings cannot be verified until Compose is valid.", List.of(), Set.of());
        }
    }

    private record LiveRuntimeInspection(boolean valid, String message, String detail) {

        private static LiveRuntimeInspection invalid(String message) {
            return new LiveRuntimeInspection(false, message, "Existing containers and data remain unchanged.");
        }
    }

    private record Mount(String source, String target, boolean readOnly) {
    }

}
