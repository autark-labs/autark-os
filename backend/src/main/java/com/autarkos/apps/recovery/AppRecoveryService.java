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
import com.autarkos.marketplace.install.AppAccessChecker;
import com.autarkos.marketplace.install.AppRuntimeMetadataReader;
import com.autarkos.marketplace.install.AppRuntimeMetadataWriter;
import com.autarkos.marketplace.install.ManagedStorageContractService;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
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
    private final AppRuntimeMetadataWriter runtimeMetadataWriter;
    private final ManagedStorageContractService storageContracts;
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
            DockerInventoryService dockerInventory,
            AppRuntimeMetadataWriter runtimeMetadataWriter,
            ManagedStorageContractService storageContracts) {
        this.observedServices = observedServices;
        this.installedApps = installedApps;
        this.catalog = catalog;
        this.runtimeMetadataReader = runtimeMetadataReader;
        this.dockerOwnership = dockerOwnership;
        this.activityLog = activityLog;
        this.recoveryOperations = recoveryOperations;
        this.accessChecker = accessChecker;
        this.dockerInventory = dockerInventory;
        this.runtimeMetadataWriter = runtimeMetadataWriter;
        this.storageContracts = storageContracts;
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
        Optional<ApplicationManifest> savedManifest = storageContracts.findManifest(runtimePath);
        ApplicationManifest deployedManifest = savedManifest.orElse(manifest);
        ComposeEvidence compose = inspectCompose(runtimePath, deployedManifest);
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
        checks.add(check("mounts", "Saved data layout", compose.storageValid(), compose.storageMessage(), String.join(", ", compose.mountLabels())));

        List<RuntimeModels.ManagedMount> composeContract = compose.mounts();
        boolean mountContractReady = metadata.map(value -> value.mountContract().isEmpty()
                        ? compose.storageValid() && !composeContract.isEmpty()
                        : ManagedStorageContractService.sameMounts(value.mountContract(), composeContract))
                .orElse(false);
        checks.add(check("mount_contract", "Durable storage contract", mountContractReady,
                mountContractReady
                        ? metadata.map(value -> value.mountContract().isEmpty()
                                ? "The verified saved layout will be recorded during recovery."
                                : "Runtime metadata and Compose agree on every managed mount.").orElse("")
                        : "Runtime metadata and Compose do not prove the same durable storage layout.",
                composeContract.size() + " managed mount(s)"));

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
                containers.stream().map(ObservedService::fingerprint).toList(), compose.mountLabels(),
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
        ApplicationManifest manifest = storageContracts.findManifest(runtimePath)
                .orElseThrow(() -> new InstallationException("The app's saved release manifest is no longer available."));
        InstallModels.InstallSettings settings = recoverySettings(appId, manifest, evidence.stream().findFirst().orElse(null),
                inspectCompose(runtimePath, manifest), runtimePath)
                .orElseThrow(() -> new InstallationException("The verified app settings are no longer available."));

        progress.accept("verify_recovery");
        RuntimeModels.AppRuntimeMetadata metadata = runtimeMetadataReader.read(runtimePath)
                .orElseThrow(() -> new InstallationException("The app runtime metadata is no longer available."));
        runtimeMetadataWriter.writeRecovered(manifest, runtimePath, metadata);
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
            ComposeEvidence compose,
            Path runtimePath) {
        Optional<InstallModels.InstallSettings> stored = installedApps.settingsFor(appId);
        if (stored.isPresent()) return stored;
        if (!compose.valid() || !compose.storageValid()) return Optional.empty();
        Optional<Map<String, String>> storage = storageContracts.recoverySettings(manifest, compose.mounts(), runtimePath);
        if (storage.isEmpty()) return Optional.empty();
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
                accessUrl.isBlank() ? null : accessUrl, null, privateAccess, storage.orElseThrow(),
                InstallModels.BackupPolicy.defaults(), mode,
                manifest.usage().privateHttpsRequired() ? "required" : "optional", localPort,
                protocol(accessUrl), null, null, null, null, true));
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

    private ComposeEvidence inspectCompose(Path appRoot, ApplicationManifest manifest) {
        Path composePath = appRoot.resolve("compose.yaml");
        if (!Files.isRegularFile(composePath)) return ComposeEvidence.invalid("The original Compose file is missing.");
        try {
            Object document = new Yaml(new SafeConstructor(new LoaderOptions())).load(Files.readString(composePath));
            if (!(document instanceof Map<?, ?> root) || !(root.get("services") instanceof Map<?, ?> services) || services.isEmpty()) {
                return ComposeEvidence.invalid("The Compose file has no readable services.");
            }
            Map<String, String> images = new LinkedHashMap<>();
            if (manifest.runtime().multiService()) manifest.runtime().services().forEach(service -> images.put(service.name(), service.image()));
            else images.put(manifest.runtime().containerName(), manifest.runtime().image());
            if (!services.keySet().stream().map(String::valueOf).collect(java.util.stream.Collectors.toSet()).equals(images.keySet())) {
                return ComposeEvidence.invalid("The Compose file does not exactly match the saved app release's services.");
            }
            Set<Integer> ports = new LinkedHashSet<>();
            for (Map.Entry<?, ?> entry : services.entrySet()) {
                if (!(entry.getValue() instanceof Map<?, ?> service)) return ComposeEvidence.invalid("The Compose file contains an invalid service definition.");
                if (!images.get(String.valueOf(entry.getKey())).equals(String.valueOf(service.get("image")))) {
                    return ComposeEvidence.invalid("A Compose image does not match the saved app release.");
                }
                Object rawPorts = service.get("ports");
                if (rawPorts != null && !(rawPorts instanceof List<?>)) return ComposeEvidence.invalid("The Compose file contains an unsupported port definition.");
                if (rawPorts instanceof List<?> mappings) for (Object mapping : mappings) {
                    Integer port = publishedPort(String.valueOf(mapping));
                    if (port == null) return ComposeEvidence.invalid("The Compose file contains an unsupported port mapping.");
                    ports.add(port);
                }
            }
            List<RuntimeModels.ManagedMount> mounts = ManagedStorageContractService.readComposeMounts(composePath);
            boolean storageValid = storageContracts.recoverySettings(manifest, mounts, appRoot).isPresent();
            return new ComposeEvidence(true, "The Compose file matches the catalog app.", storageValid,
                    storageValid ? "Mounted data can be preserved as managed storage."
                            : "A mounted data path cannot be represented safely by managed app settings.",
                    mounts, Map.copyOf(images), Set.copyOf(ports));
        } catch (IOException | RuntimeException exception) {
            return ComposeEvidence.invalid("The Compose file could not be parsed safely.");
        }
    }

    private Integer publishedPort(String mapping) {
        Matcher matcher = PUBLISHED_PORT.matcher(mapping.replace("0.0.0.0:", "").replace("127.0.0.1:", ""));
        if (!matcher.find()) return null;
        int port = Integer.parseInt(matcher.group(1));
        return port > 0 && port <= 65535 ? port : null;
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
                        metadataValue(service, "appInstanceId"), blank(service.metadataJson(), "")))
                .sorted().toList();
        String material = String.join("|", appId, reason, runtimePath.toString(), composeProject,
                appInstanceId, fileHash(runtimePath.resolve("compose.yaml")),
                fileHash(runtimePath.resolve("manifest.yaml")),
                fileHash(runtimePath.resolve(AppRuntimeMetadataWriter.METADATA_FILE)), String.join(",", evidence), json(settings));
        return "recovery_" + sha256(material);
    }

    private LiveRuntimeInspection inspectLiveRuntime(
            List<ObservedService> containers,
            ComposeEvidence compose,
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
        List<String> expectedServices = compose.images().keySet().stream().sorted().toList();
        List<String> actualServices = containers.stream()
                .map(service -> metadataValue(service, "composeService"))
                .sorted().toList();
        if (!actualServices.equals(expectedServices)) {
            return LiveRuntimeInspection.invalid("The running containers do not exactly match the saved app services.");
        }
        List<String> expectedImages = compose.images().values().stream().sorted().toList();
        List<String> actualImages = containers.stream()
                .map(service -> metadataValue(service, "image"))
                .sorted().toList();
        if (!actualImages.equals(expectedImages)) {
            return LiveRuntimeInspection.invalid("A running container image does not match the saved app release.");
        }
        List<RuntimeModels.ManagedMount> actualMounts = new ArrayList<>();
        for (ObservedService container : containers) {
            Optional<List<RuntimeModels.ManagedMount>> mounts = liveMounts(container);
            if (mounts.isEmpty()) {
                return LiveRuntimeInspection.invalid("Docker did not provide complete live mount details for every app container.");
            }
            actualMounts.addAll(mounts.orElseThrow());
        }
        if (!ManagedStorageContractService.sameMounts(compose.mounts(), actualMounts)) {
            return LiveRuntimeInspection.invalid("The running container mounts differ from the saved app configuration. Existing data will not be changed.");
        }
        return new LiveRuntimeInspection(
                true,
                "The running containers, images, and mounted data match the saved app release.",
                containers.size() + " container(s), " + actualMounts.size() + " mounted data path(s)");
    }

    private Optional<List<RuntimeModels.ManagedMount>> liveMounts(ObservedService service) {
        try {
            JsonNode metadata = objectMapper.readTree(service.metadataJson());
            JsonNode mounts = metadata == null ? null : metadata.get("liveMounts");
            if (mounts == null || !mounts.isArray()) return Optional.empty();
            String serviceName = metadataValue(service, "composeService");
            List<RuntimeModels.ManagedMount> values = new ArrayList<>();
            for (JsonNode mount : mounts) {
                String type = mount.path("type").asText("");
                String source = mount.path("source").asText("");
                String target = mount.path("target").asText("");
                if (serviceName.isBlank() || !("bind".equals(type) || "volume".equals(type))
                        || source.isBlank() || ("bind".equals(type) && !source.startsWith("/"))
                        || target.isBlank() || !target.startsWith("/")) {
                    return Optional.empty();
                }
                values.add(new RuntimeModels.ManagedMount(
                        serviceName,
                        type,
                        "bind".equals(type) ? Path.of(source).toAbsolutePath().normalize().toString() : source,
                        target,
                        mount.path("readOnly").asBoolean(false)));
            }
            return Optional.of(List.copyOf(values));
        } catch (IOException | RuntimeException exception) {
            return Optional.empty();
        }
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

    private record LiveRuntimeInspection(boolean valid, String message, String detail) {

        private static LiveRuntimeInspection invalid(String message) {
            return new LiveRuntimeInspection(false, message, "Existing containers and data remain unchanged.");
        }
    }

    private record ComposeEvidence(
            boolean valid,
            String message,
            boolean storageValid,
            String storageMessage,
            List<RuntimeModels.ManagedMount> mounts,
            Map<String, String> images,
            Set<Integer> ports) {

        private List<String> mountLabels() {
            return mounts.stream().map(mount -> mount.source() + ":" + mount.destination()).toList();
        }

        private static ComposeEvidence invalid(String message) {
            return new ComposeEvidence(false, message, false,
                    "Mount mappings cannot be verified until Compose is valid.", List.of(), Map.of(), Set.of());
        }
    }

}
