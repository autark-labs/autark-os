package com.autarkos.apps.recovery;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.apps.ApplicationInventoryService;
import com.autarkos.apps.ApplicationRelationship;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.host.HostModels;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppRuntimeMetadataReader;
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
    static final String PREVIOUS_INSTANCE = "previous_instance";
    static final String LEGACY_AUTARK = "legacy_autark";
    static final String INSUFFICIENT_EVIDENCE = "insufficient_evidence";

    private static final Pattern PUBLISHED_PORT = Pattern.compile("(?:^|:)(\\d+):\\d+(?:/(?:tcp|udp))?$");

    private final ApplicationInventoryService applicationInventory;
    private final ObservedServiceService observedServices;
    private final InstalledAppRepository installedApps;
    private final MarketplaceCatalogService catalog;
    private final AppRuntimeMetadataReader runtimeMetadataReader;
    private final com.autarkos.marketplace.install.DockerOwnershipService dockerOwnership;
    private final ActivityLogService activityLog;
    private final ApplicationStateService applicationState;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AppRecoveryService(
            ApplicationInventoryService applicationInventory,
            ObservedServiceService observedServices,
            InstalledAppRepository installedApps,
            MarketplaceCatalogService catalog,
            AppRuntimeMetadataReader runtimeMetadataReader,
            com.autarkos.marketplace.install.DockerOwnershipService dockerOwnership,
            ActivityLogService activityLog,
            ApplicationStateService applicationState) {
        this.applicationInventory = applicationInventory;
        this.observedServices = observedServices;
        this.installedApps = installedApps;
        this.catalog = catalog;
        this.runtimeMetadataReader = runtimeMetadataReader;
        this.dockerOwnership = dockerOwnership;
        this.activityLog = activityLog;
        this.applicationState = applicationState;
    }

    public List<AppRecoveryModels.RecoveryCandidate> list() {
        return applicationInventory.apps().stream()
                .filter(app -> app.relationship() == ApplicationRelationship.RECOVERY_REQUIRED)
                .map(app -> new AppRecoveryModels.RecoveryCandidate(
                        app.id(),
                        app.name(),
                        reasonFor(bestEvidence(app.id()).orElse(null)),
                        app.relationshipDescription(),
                        "/api/app-recovery/" + encode(app.id()) + "/plan"))
                .toList();
    }

    public AppRecoveryModels.RecoveryPlan plan(String appId) {
        ApplicationManifest manifest = catalog.findById(appId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown catalog application: " + appId));
        Optional<ObservedService> selectedEvidence = bestEvidence(appId);
        ObservedService evidence = selectedEvidence.orElse(null);
        String reason = reasonFor(evidence);
        AutarkOsIdentity identity = dockerOwnership.currentIdentity();
        Path runtimePath = runtimePath(appId, evidence, identity);
        Optional<RuntimeModels.AppRuntimeMetadata> metadata = runtimeMetadataReader.read(runtimePath);
        ComposeInspection compose = inspectCompose(runtimePath.resolve("compose.yaml"), manifest);
        List<ObservedService> containers = matchingDockerEvidence(appId);
        List<AppRecoveryModels.RecoveryCheck> checks = new ArrayList<>();

        boolean catalogIdentity = evidence != null && appId.equals(evidence.catalogAppId())
                && metadata.map(value -> appId.equals(value.catalogAppId())).orElse(false);
        checks.add(check("catalog_identity", "Catalog application", catalogIdentity,
                catalogIdentity ? "Runtime metadata identifies " + manifest.name() + "." : "Catalog identity could not be proven from both Docker and runtime metadata.",
                evidence == null ? "No matching Docker evidence." : "Docker match: " + blank(evidence.catalogMatchConfidence(), "unknown")));

        String appInstanceId = metadata.map(RuntimeModels.AppRuntimeMetadata::appInstanceId).orElse("");
        Set<String> observedInstanceIds = containers.stream().map(service -> metadataValue(service, "appInstanceId"))
                .filter(value -> !value.isBlank()).collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        boolean instanceIdentity = !appInstanceId.isBlank()
                && (observedInstanceIds.isEmpty() || observedInstanceIds.equals(Set.of(appInstanceId)));
        checks.add(check("app_instance_identity", "App instance", instanceIdentity,
                instanceIdentity ? "App-instance identity is consistent." : "App-instance identity is missing or inconsistent.",
                blank(appInstanceId, "No app-instance ID found")));

        boolean runtimeSafe = safeRuntimePath(runtimePath, identity) && Files.isDirectory(runtimePath);
        checks.add(check("runtime_path", "Runtime location", runtimeSafe,
                runtimeSafe ? "The runtime folder is present inside Autark-OS storage." : "The runtime folder is missing or outside the active runtime root.", runtimePath.toString()));

        checks.add(check("compose", "Compose configuration", compose.valid(), compose.message(), runtimePath.resolve("compose.yaml").toString()));
        checks.add(check("mounts", "Data mappings", compose.mountsValid(), compose.mountMessage(), String.join(", ", compose.mounts())));

        boolean containersPresent = !containers.isEmpty();
        boolean currentOwnership = containersPresent && containers.stream().allMatch(service -> "owned_managed".equals(service.ownershipState()));
        checks.add(check("docker_ownership", "Docker ownership", currentOwnership,
                currentOwnership ? "All matching containers belong to this Autark-OS instance."
                        : containersPresent ? ownershipMessage(reason) : "No matching Docker containers were found.",
                containers.stream().map(ObservedService::fingerprint).collect(java.util.stream.Collectors.joining(", "))));

        Set<Integer> conflicts = portConflicts(appId, compose.ports());
        checks.add(check("ports", "Published ports", conflicts.isEmpty(),
                conflicts.isEmpty() ? "No other application evidence claims these ports." : "Another service claims: " + conflicts,
                compose.ports().isEmpty() ? "No published ports" : compose.ports().toString()));

        boolean noManagedConflict = installedApps.findAppById(appId).isEmpty();
        checks.add(check("managed_record", "Managed registration", noManagedConflict,
                noManagedConflict ? "No installed-app record will be overwritten." : "An installed-app record already exists and must not be overwritten.", appId));

        Optional<InstallModels.InstallSettings> settings = installedApps.settingsFor(appId);
        boolean exactSettings = settings.isPresent();
        checks.add(check("settings", "Managed settings", exactSettings,
                exactSettings ? "The original settings record is available." : "The original access, storage, and backup settings are unavailable; Autark-OS will not guess them.",
                exactSettings ? "Existing settings will be retained." : "No settings record found."));

        boolean lifecycleAvailable = CURRENT_INSTANCE_REGISTRATION_LOST.equals(reason)
                && checks.stream().allMatch(check -> "passed".equals(check.status()));
        checks.add(check("managed_lifecycle", "Complete managed lifecycle", lifecycleAvailable,
                lifecycleAvailable ? "Start, stop, restart, repair, settings, backup, update, and uninstall can use the recovered runtime."
                        : "A complete managed lifecycle cannot be guaranteed from the current evidence.",
                lifecycleAvailable ? "Ready for registration recovery." : "Existing resources remain unchanged."));

        List<String> blocked = checks.stream().filter(check -> "blocked".equals(check.status()))
                .map(AppRecoveryModels.RecoveryCheck::message).distinct().toList();
        boolean applicable = blocked.isEmpty();
        String summary = applicable
                ? "Autark-OS can restore the lost registration without changing the running containers or guessing settings."
                : "Autark-OS found recovery evidence, but will not claim this app until every managed-lifecycle check passes.";
        return new AppRecoveryModels.RecoveryPlan(
                appId,
                manifest.name(),
                reason,
                applicable,
                summary,
                runtimePath.toString(),
                metadata.map(RuntimeModels.AppRuntimeMetadata::composeProject).orElse(""),
                appInstanceId,
                containers.stream().map(ObservedService::fingerprint).toList(),
                compose.mounts(),
                compose.ports().stream().map(String::valueOf).toList(),
                List.copyOf(checks),
                List.of(
                        "Re-read Docker, runtime, Compose, settings, mount, and port evidence.",
                        "Restore only the missing current-instance registration.",
                        "Refresh canonical application state and verify the full managed lifecycle."),
                blocked,
                "RECOVER " + manifest.name().toUpperCase(java.util.Locale.ROOT));
    }

    @Transactional
    public HostModels.ActionResult apply(String appId, AppRecoveryModels.RecoveryApplyRequest request) {
        AppRecoveryModels.RecoveryPlan plan = plan(appId);
        if (!plan.applicable()) {
            return new HostModels.ActionResult(false, "warning", "Recovery is not safe yet",
                    String.join(" ", plan.blockedReasons()), appId, "review_recovery_plan");
        }
        if (request == null || request.confirmation() == null || !request.confirmation().equals(plan.confirmationText())) {
            return new HostModels.ActionResult(false, "warning", "Confirmation required",
                    "Type the confirmation text exactly before restoring management.", appId, "confirm_recovery");
        }
        ApplicationManifest manifest = catalog.findById(appId).orElseThrow();
        InstallModels.InstallSettings settings = installedApps.settingsFor(appId)
                .orElseThrow(() -> new IllegalStateException("The verified settings record is no longer available."));
        Instant now = Instant.now();
        installedApps.save(new InstalledApp(
                appId,
                manifest.name(),
                "Ready",
                plan.runtimePath(),
                plan.composeProject(),
                settings.accessUrl(),
                now));
        installedApps.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                appId,
                plan.appInstanceId(),
                appId,
                dockerOwnership.currentIdentity().instanceId(),
                plan.runtimePath(),
                "recovered",
                "owned",
                now,
                now));
        installedApps.recordEvent(appId, "registration_recovered", "Restored the lost current-instance app registration.");
        activityLog.success("applications", "app_registration_recovered", "App management restored",
                "Autark-OS restored management for " + manifest.name() + " from verified current-instance records.", appId);
        return new HostModels.ActionResult(true, "success", "App management restored",
                manifest.name() + " is fully managed again.", appId, "open_apps", applicationState.refreshNow());
    }

    private Optional<ObservedService> bestEvidence(String appId) {
        return matchingDockerEvidence(appId).stream()
                .sorted(Comparator.comparingInt(this::evidencePriority))
                .findFirst();
    }

    private List<ObservedService> matchingDockerEvidence(String appId) {
        return observedServices.matchingCatalogServices(appId).stream()
                .filter(service -> HostModels.ObservedServiceSource.DOCKER.equals(service.source()))
                .toList();
    }

    private int evidencePriority(ObservedService service) {
        return switch (service.ownershipState()) {
            case "owned_managed" -> 0;
            case "foreign_autark_os" -> 1;
            case "legacy_autark_os" -> 2;
            default -> 3;
        };
    }

    private String reasonFor(ObservedService evidence) {
        if (evidence == null) return INSUFFICIENT_EVIDENCE;
        return switch (evidence.ownershipState()) {
            case "owned_managed" -> installedApps.findAppById(evidence.catalogAppId()).isEmpty()
                    ? CURRENT_INSTANCE_REGISTRATION_LOST : INSUFFICIENT_EVIDENCE;
            case "foreign_autark_os" -> PREVIOUS_INSTANCE;
            case "legacy_autark_os" -> LEGACY_AUTARK;
            default -> INSUFFICIENT_EVIDENCE;
        };
    }

    private String ownershipMessage(String reason) {
        return switch (reason) {
            case PREVIOUS_INSTANCE -> "These containers belong to a previous Autark-OS instance. Ownership transfer requires the complete recovery transaction.";
            case LEGACY_AUTARK -> "These legacy containers do not carry complete instance ownership labels.";
            default -> "Docker ownership cannot be proven for the current Autark-OS instance.";
        };
    }

    private Path runtimePath(String appId, ObservedService evidence, AutarkOsIdentity identity) {
        String recorded = firstPresent(metadataValue(evidence, "runtimePath"), metadataValue(evidence, "dataPaths"));
        try {
            return Path.of(recorded.isBlank() ? identity.runtimeRoot() + "/apps/" + appId : recorded).toAbsolutePath().normalize();
        } catch (RuntimeException exception) {
            return Path.of(identity.runtimeRoot(), "apps", appId).toAbsolutePath().normalize();
        }
    }

    private boolean safeRuntimePath(Path path, AutarkOsIdentity identity) {
        try {
            Path root = Path.of(identity.runtimeRoot()).toAbsolutePath().normalize();
            return !identity.runtimeRoot().isBlank() && path.startsWith(root.resolve("apps"));
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private ComposeInspection inspectCompose(Path composePath, ApplicationManifest manifest) {
        if (!Files.isRegularFile(composePath)) {
            return ComposeInspection.invalid("The original Compose file is missing.");
        }
        try {
            Object document = new Yaml(new SafeConstructor(new LoaderOptions())).load(Files.readString(composePath));
            if (!(document instanceof Map<?, ?> root) || !(root.get("services") instanceof Map<?, ?> services) || services.isEmpty()) {
                return ComposeInspection.invalid("The Compose file has no readable services.");
            }
            Set<String> expectedServices = expectedServices(manifest);
            if (!services.keySet().stream().map(String::valueOf).collect(java.util.stream.Collectors.toSet()).containsAll(expectedServices)) {
                return ComposeInspection.invalid("The Compose file does not contain the catalog application's expected services.");
            }
            List<String> mounts = new ArrayList<>();
            Set<Integer> ports = new LinkedHashSet<>();
            boolean mountsValid = true;
            for (Object serviceValue : services.values()) {
                if (!(serviceValue instanceof Map<?, ?> service)) {
                    return ComposeInspection.invalid("The Compose file contains an invalid service definition.");
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
                if (portsValue != null && !(portsValue instanceof List<?>)) {
                    return ComposeInspection.invalid("The Compose file contains an unsupported port definition.");
                }
                if (portsValue instanceof List<?> mappings) {
                    for (Object value : mappings) {
                        Integer published = publishedPort(String.valueOf(value));
                        if (published == null) return ComposeInspection.invalid("The Compose file contains an unsupported port mapping.");
                        ports.add(published);
                    }
                }
            }
            return new ComposeInspection(true, "The Compose file is structurally valid and matches the catalog app.",
                    mountsValid, mountsValid ? "Volume and bind-mount mappings are readable." : "A volume or bind-mount mapping is invalid.",
                    List.copyOf(mounts), Set.copyOf(ports));
        } catch (IOException | RuntimeException exception) {
            return ComposeInspection.invalid("The Compose file could not be parsed safely.");
        }
    }

    private Set<String> expectedServices(ApplicationManifest manifest) {
        if (manifest.runtime().multiService()) {
            return manifest.runtime().services().stream().map(RuntimeServiceManifest::name).collect(java.util.stream.Collectors.toSet());
        }
        return Set.of(manifest.runtime().containerName());
    }

    private boolean validMount(String mapping) {
        String[] parts = mapping.split(":");
        if (parts.length < 2) return false;
        String target = parts[parts.length - 1].equals("ro") || parts[parts.length - 1].equals("rw")
                ? parts[parts.length - 2] : parts[parts.length - 1];
        if (!target.startsWith("/")) return false;
        String source = parts[0];
        return !source.startsWith(".") && (!source.startsWith("/") || Path.of(source).isAbsolute());
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
        observedServices.observedServices().stream()
                .filter(service -> !appId.equals(service.catalogAppId()))
                .map(service -> metadataValue(service, "ports"))
                .flatMap(value -> portValues(value).stream())
                .filter(plannedPorts::contains)
                .forEach(conflicts::add);
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
                // Ignore malformed observation; Compose validation remains authoritative.
            }
        }
        return ports;
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

    private String firstPresent(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value.trim();
        return "";
    }

    private String blank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }

    private record ComposeInspection(
            boolean valid,
            String message,
            boolean mountsValid,
            String mountMessage,
            List<String> mounts,
            Set<Integer> ports) {

        private static ComposeInspection invalid(String message) {
            return new ComposeInspection(false, message, false, "Mount mappings cannot be verified until Compose is valid.", List.of(), Set.of());
        }
    }
}
