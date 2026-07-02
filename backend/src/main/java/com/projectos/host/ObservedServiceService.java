package com.projectos.host;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.projectos.activity.ActivityLogService;
import com.projectos.api.ApplicationBehaviorStates;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.install.DockerOwnershipService;
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppOwnershipMetadata;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.system.ProjectOsIdentity;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ObservedServiceService {

    private final ObservedServiceRepository repository;
    private final ObservedServiceScanner scanner;
    private final InstalledAppRepository installedAppRepository;
    private final MarketplaceCatalogService catalogService;
    private final Supplier<ProjectOsIdentity> currentIdentity;
    private final ActivityLogService activityLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public ObservedServiceService(
            ObservedServiceRepository repository,
            ObservedServiceScanner scanner,
            InstalledAppRepository installedAppRepository,
            MarketplaceCatalogService catalogService,
            DockerOwnershipService ownershipService,
            ActivityLogService activityLogService) {
        this.repository = repository;
        this.scanner = scanner;
        this.installedAppRepository = installedAppRepository;
        this.catalogService = catalogService;
        this.currentIdentity = ownershipService::currentIdentity;
        this.activityLogService = activityLogService;
    }

    public ObservedServiceService(ObservedServiceRepository repository, ObservedServiceScanner scanner) {
        this(repository, scanner, null, null, () -> new ProjectOsIdentity("", "project-os", "", "", Instant.EPOCH, 1), null, true);
    }

    public ObservedServiceService(ObservedServiceRepository repository, ObservedServiceScanner scanner, InstalledAppRepository installedAppRepository, MarketplaceCatalogService catalogService, Supplier<ProjectOsIdentity> currentIdentity) {
        this(repository, scanner, installedAppRepository, catalogService, currentIdentity, null, true);
    }

    public ObservedServiceService(
            ObservedServiceRepository repository,
            ObservedServiceScanner scanner,
            InstalledAppRepository installedAppRepository,
            MarketplaceCatalogService catalogService,
            Supplier<ProjectOsIdentity> currentIdentity,
            ActivityLogService activityLogService) {
        this(repository, scanner, installedAppRepository, catalogService, currentIdentity, activityLogService, true);
    }

    protected ObservedServiceService() {
        this(null, null, null, null, () -> new ProjectOsIdentity("", "project-os", "", "", Instant.EPOCH, 1), null, true);
    }

    private ObservedServiceService(
            ObservedServiceRepository repository,
            ObservedServiceScanner scanner,
            InstalledAppRepository installedAppRepository,
            MarketplaceCatalogService catalogService,
            Supplier<ProjectOsIdentity> currentIdentity,
            ActivityLogService activityLogService,
            boolean ignored) {
        this.repository = repository;
        this.scanner = scanner;
        this.installedAppRepository = installedAppRepository;
        this.catalogService = catalogService;
        this.currentIdentity = currentIdentity;
        this.activityLogService = activityLogService;
    }

    public List<ObservedServiceView> refresh() {
        Instant now = Instant.now();
        if (scanner != null) {
            for (ObservedService scanned : scanner.scan(now)) {
                ObservedService merged = repository.findBySourceAndFingerprint(scanned.source(), scanned.fingerprint())
                        .map(existing -> merge(existing, scanned))
                        .orElse(scanned);
                repository.upsert(merged);
            }
        }
        return list(true);
    }

    public List<ObservedServiceView> list(boolean includeIgnored) {
        return repository.findAll().stream()
                .filter(service -> includeIgnored || !"ignored".equals(service.userVisibility()))
                .map(ObservedServiceService::toView)
                .toList();
    }

    public List<ObservedService> observedServices() {
        return repository.findAll();
    }

    public ObservedServiceView get(String id) {
        return repository.findById(id)
                .map(ObservedServiceService::toView)
                .orElseThrow(() -> new IllegalArgumentException("Unknown observed service: " + id));
    }

    public ActionResult pin(String id) {
        if (!repository.pin(id, Instant.now())) {
            return new ActionResult(false, "warning", "Observed service not found", "Project OS could not find that observed service. Refresh the page and try again.", id, "refresh_observed_services");
        }
        return new ActionResult(true, "success", "Service pinned", "The service now appears in My Apps. Project OS will not manage its runtime.", id, "refresh_observed_services");
    }

    public ActionResult unpin(String id) {
        if (!repository.unpin(id)) {
            return new ActionResult(false, "warning", "Observed service not found", "Project OS could not find that observed service. Refresh the page and try again.", id, "refresh_observed_services");
        }
        return new ActionResult(true, "success", "Service unpinned", "The service was removed from My Apps but remains listed as observed on this system.", id, "refresh_observed_services");
    }

    public ActionResult updateCatalogMatch(String id, String catalogAppId) {
        boolean updated = repository.updateCatalogMatch(id, catalogAppId, catalogAppId == null || catalogAppId.isBlank() ? "unknown" : "user");
        if (!updated) {
            return new ActionResult(false, "warning", "Observed service not found", "Project OS could not find that observed service. Refresh the page and try again.", id, "refresh_observed_services");
        }
        String message = catalogAppId == null || catalogAppId.isBlank()
                ? "The service no longer has a catalog app match."
                : "The service now affects Marketplace state for " + catalogAppId + ".";
        return new ActionResult(true, "success", "App match saved", message, id, "refresh_observed_services");
    }

    public List<ObservedService> matchingCatalogServices(String appId) {
        String normalized = normalizeToken(appId);
        return repository.findAll().stream()
                .filter(service -> appId.equals(service.catalogAppId()) || (service.catalogAppId() == null && matchesNameOrUrl(service, normalized)))
                .toList();
    }

    public void recordFailedInstall(ApplicationManifest manifest, String accessUrl, String runtimePath, String composeProject, String message, List<String> logs) {
        if (repository == null || manifest == null) {
            return;
        }
        Instant now = Instant.now();
        ProjectOsIdentity identity = currentIdentity.get();
        repository.upsert(new ObservedService(
                "project-os-install:" + manifest.id(),
                ObservedServiceSource.PROJECT_OS_INSTALL,
                manifest.id(),
                manifest.name(),
                cleanToNull(accessUrl),
                blankDefault(manifest.category(), "Applications"),
                "LAN",
                manifest.id(),
                "project_os_failed_install",
                "failed_install",
                "observed",
                "failed",
                false,
                identity.instanceId(),
                now,
                now,
                null,
                null,
                failedInstallMetadata(runtimePath, composeProject, message, logs)));
    }

    public void clearFailedInstall(String catalogAppId) {
        if (repository == null || catalogAppId == null || catalogAppId.isBlank()) {
            return;
        }
        repository.deleteFailedInstall(catalogAppId);
    }

    public ObservedServiceAdoptionPlan adoptionPlan(String id) {
        ObservedService service = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Unknown observed service: " + id));
        String displayName = displayName(service);
        if (!ObservedServiceSource.DOCKER.equals(service.source())) {
            return unavailablePlan(id, displayName, service.catalogAppId(), "This service is not a local Docker container.", "Only Docker-backed services can be adopted.");
        }
        boolean adoptable = "legacy_project_os".equals(service.ownershipState()) || "foreign_project_os".equals(service.ownershipState());
        if (!adoptable) {
            return unavailablePlan(id, displayName, service.catalogAppId(), "Project OS cannot safely adopt this service yet.", "This service does not expose recoverable Project OS ownership metadata.");
        }
        if (service.catalogAppId() == null || service.catalogAppId().isBlank()) {
            return unavailablePlan(id, displayName, null, "Project OS cannot adopt this service until it is matched to a catalog app.", "Choose the matching app first.");
        }
        return new ObservedServiceAdoptionPlan(
                id,
                true,
                "Project OS will take control of " + displayName + " without deleting its data or recreating its container.",
                containers(service),
                service.catalogAppId(),
                List.of("Current Project OS ownership record", "Managed app access settings"),
                false,
                "Existing data paths and the running container are preserved.",
                List.of("Project OS will treat this service as managed after adoption. Do not run another installer for the same app unless you intentionally want multiple copies."),
                "",
                confirmationText(displayName),
                List.of(
                        "Add " + displayName + " to My Apps as a managed app.",
                        "Keep the existing Docker container and access URL.",
                        "Record this Project OS installation as the owner for app recovery and marketplace state."),
                List.of());
    }

    public ActionResult adopt(String id, ObservedServiceAdoptionRequest request) {
        ObservedServiceAdoptionPlan plan = adoptionPlan(id);
        if (!plan.available()) {
            return new ActionResult(false, "warning", "Adoption unavailable", String.join(" ", plan.blockedReasons()), id, "review_adoption_plan");
        }
        if (request == null
                || !request.confirmed()
                || !request.takeControlConfirmed()
                || request.confirmation() == null
                || !request.confirmation().equals(plan.confirmationText())) {
            return new ActionResult(false, "warning", "Confirmation required", "Type the confirmation text exactly before Project OS takes control of this service.", id, "confirm_adoption");
        }
        if (installedAppRepository == null || catalogService == null) {
            return new ActionResult(false, "error", "Adoption unavailable", "Project OS cannot save managed app state in this runtime.", id, "review_adoption_plan");
        }
        ObservedService service = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Unknown observed service: " + id));
        String appId = service.catalogAppId();
        ApplicationManifest manifest = catalogService.findById(appId).orElse(null);
        String displayName = manifest == null ? displayName(service) : manifest.name();
        Instant now = Instant.now();
        ProjectOsIdentity identity = currentIdentity.get();
        String accessUrl = firstPresent(service.url(), manifest == null ? null : manifest.accessUrl());
        String runtimePath = firstPresent(metadataValue(service, "dataPaths"), metadataValue(service, "runtimePath"), manifest == null ? "" : identity.runtimeRoot() + "/apps/" + appId);
        String composeProject = firstPresent(metadataValue(service, "composeProject"), service.fingerprint());
        String appInstanceId = firstPresent(metadataValue(service, "appInstanceId"), "appinst_adopted_" + appId);

        installedAppRepository.save(new InstalledApp(
                appId,
                displayName,
                "Ready",
                runtimePath,
                composeProject,
                accessUrl,
                now));
        installedAppRepository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
                appId,
                appInstanceId,
                appId,
                identity.instanceId(),
                runtimePath,
                "adopted",
                "owned",
                now,
                now));
        installedAppRepository.saveSettings(appId, InstallSettings.defaults(accessUrl));
        repository.markManaged(id, identity.instanceId(), now);
        if (activityLogService != null) {
            activityLogService.success("host", "adopt_observed_service", "Service adopted", "Project OS now manages " + displayName + ".", appId);
        }
        return new ActionResult(true, "success", "Service adopted", displayName + " now appears as a managed app in Project OS.", id, "open_apps");
    }

    private ObservedServiceAdoptionPlan unavailablePlan(String id, String displayName, String catalogAppId, String summary, String reason) {
        return new ObservedServiceAdoptionPlan(
                id,
                false,
                summary,
                List.of(),
                catalogAppId,
                List.of(),
                false,
                "No local data paths will be changed.",
                List.of(),
                reason,
                confirmationText(displayName),
                List.of(),
                List.of(reason));
    }

    private String metadataValue(ObservedService service, String key) {
        if (service.metadataJson() == null || service.metadataJson().isBlank()) {
            return "";
        }
        try {
            JsonNode node = objectMapper.readTree(service.metadataJson());
            JsonNode value = node.path(key);
            return value.isMissingNode() || value.isNull() ? "" : value.asText("");
        } catch (RuntimeException exception) {
            return "";
        } catch (java.io.IOException exception) {
            return "";
        }
    }

    private String displayName(ObservedService service) {
        if (catalogService != null && service.catalogAppId() != null && !service.catalogAppId().isBlank()) {
            Optional<ApplicationManifest> manifest = catalogService.findById(service.catalogAppId());
            if (manifest.isPresent()) {
                return manifest.get().name();
            }
        }
        return service.displayName() == null || service.displayName().isBlank() ? service.fingerprint() : titleCase(service.displayName());
    }

    private String confirmationText(String displayName) {
        return "ADOPT " + displayName.toUpperCase(java.util.Locale.ROOT);
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private String titleCase(String value) {
        String normalized = value.replace('-', ' ').replace('_', ' ').trim();
        if (normalized.isBlank()) {
            return value;
        }
        return java.util.Arrays.stream(normalized.split("\\s+"))
                .map(part -> part.isBlank() ? part : Character.toUpperCase(part.charAt(0)) + part.substring(1))
                .collect(java.util.stream.Collectors.joining(" "));
    }

    public static ObservedServiceView toView(ObservedService service) {
        String userStatus = userStatus(service);
        boolean pinned = "pinned".equals(service.userVisibility());
        boolean managedByThisProjectOs = "owned_managed".equals(service.ownershipState());
        return new ObservedServiceView(
                service.id(),
                service.source(),
                service.displayName(),
                service.url(),
                service.category(),
                service.accessScope(),
                service.catalogAppId(),
                service.catalogMatchConfidence(),
                userStatus,
                userStatusLabel(userStatus),
                userStatusDescription(service, userStatus),
                ApplicationBehaviorStates.observedManagementState(userStatus, pinned, managedByThisProjectOs),
                ApplicationBehaviorStates.observedReadinessState(service.runtimeState(), service.url(), pinned),
                ApplicationBehaviorStates.observedAttentionState(userStatus),
                service.ownershipState(),
                service.runtimeState(),
                pinned,
                managedByThisProjectOs,
                adoptable(service),
                service.catalogAppId() != null
                        && !"owned_managed".equals(service.ownershipState())
                        && !"failed_install".equals(service.ownershipState()),
                actions(service),
                metadata(service));
    }

    private ObservedService merge(ObservedService existing, ObservedService scanned) {
        String catalogAppId = existing.catalogAppId() != null && !existing.catalogAppId().isBlank()
                ? existing.catalogAppId()
                : scanned.catalogAppId();
        String confidence = existing.catalogAppId() != null && !existing.catalogAppId().isBlank()
                ? existing.catalogMatchConfidence()
                : scanned.catalogMatchConfidence();
        boolean explicitAdoption = "owned_managed".equals(existing.ownershipState())
                && !"owned_managed".equals(scanned.ownershipState());
        String ownershipState = explicitAdoption ? existing.ownershipState() : scanned.ownershipState();
        String projectOsInstanceId = explicitAdoption ? existing.projectOsInstanceId() : scanned.projectOsInstanceId();
        return new ObservedService(
                existing.id(),
                existing.source(),
                existing.fingerprint(),
                scanned.displayName(),
                scanned.url(),
                scanned.category(),
                scanned.accessScope(),
                catalogAppId,
                confidence,
                ownershipState,
                existing.userVisibility(),
                scanned.runtimeState(),
                existing.healthCheckEnabled(),
                projectOsInstanceId,
                existing.firstSeenAt(),
                scanned.lastSeenAt(),
                existing.pinnedAt(),
                existing.ignoredAt(),
                scanned.metadataJson());
    }

    private static String userStatus(ObservedService service) {
        if ("owned_managed".equals(service.ownershipState())) {
            return ObservedServiceStatus.MANAGED;
        }
        if ("legacy_project_os".equals(service.ownershipState())) {
            return ObservedServiceStatus.RECOVERABLE;
        }
        if ("foreign_project_os".equals(service.ownershipState())) {
            return ObservedServiceStatus.OWNED_ELSEWHERE;
        }
        if ("unknown_conflict".equals(service.ownershipState())) {
            return ObservedServiceStatus.CONFLICT;
        }
        if ("failed_install".equals(service.ownershipState())) {
            return ObservedServiceStatus.FAILED_INSTALL;
        }
        if ("pinned".equals(service.userVisibility())) {
            return ObservedServiceStatus.PINNED;
        }
        return ObservedServiceStatus.FOUND;
    }

    private static String userStatusLabel(String status) {
        return switch (status) {
            case ObservedServiceStatus.MANAGED -> "Managed";
            case ObservedServiceStatus.PINNED -> "Pinned";
            case ObservedServiceStatus.RECOVERABLE -> "Recoverable";
            case ObservedServiceStatus.OWNED_ELSEWHERE -> "Owned elsewhere";
            case ObservedServiceStatus.CONFLICT -> "Conflict";
            case ObservedServiceStatus.FAILED_INSTALL -> "Install failed";
            default -> "Found";
        };
    }

    private static String userStatusDescription(ObservedService service, String status) {
        return switch (status) {
            case ObservedServiceStatus.MANAGED -> "Managed by this Project OS installation.";
            case ObservedServiceStatus.PINNED -> "Pinned to My Apps. Project OS can open it but does not manage its runtime.";
            case ObservedServiceStatus.RECOVERABLE -> "Project OS found recoverable app metadata for this service.";
            case ObservedServiceStatus.OWNED_ELSEWHERE -> "Owned by another Project OS installation.";
            case ObservedServiceStatus.CONFLICT -> "This service may block installing a managed copy.";
            case ObservedServiceStatus.FAILED_INSTALL -> "Project OS started creating this app but did not finish. Review setup or click install again when ready.";
            default -> "Found on this server.";
        };
    }

    private static List<ObservedServiceAction> actions(ObservedService service) {
        java.util.ArrayList<ObservedServiceAction> actions = new java.util.ArrayList<>();
        if (service.url() != null && !service.url().isBlank()) {
            actions.add(new ObservedServiceAction("open", "Open", "external", service.url(), null, false, ""));
        }
        if ("failed_install".equals(service.ownershipState())) {
            if (service.catalogAppId() != null && !service.catalogAppId().isBlank()) {
                actions.add(new ObservedServiceAction("review_setup", "Review setup", "route", "/discover?app=" + encode(service.catalogAppId()), null, false, ""));
            }
            return List.copyOf(actions);
        }
        if ("pinned".equals(service.userVisibility())) {
            actions.add(new ObservedServiceAction("unpin", "Unpin from My Apps", "api", "/api/observed-services/" + encode(service.id()) + "/unpin", "POST", false, ""));
        } else {
            actions.add(new ObservedServiceAction("pin", "Pin to My Apps", "api", "/api/observed-services/" + encode(service.id()) + "/pin", "POST", false, ""));
        }
        if (adoptable(service)) {
            actions.add(new ObservedServiceAction("adoption_plan", "Review adoption plan", "api", "/api/observed-services/" + encode(service.id()) + "/adoption-plan", "POST", false, ""));
        }
        if (service.catalogAppId() != null && !"owned_managed".equals(service.ownershipState())) {
            actions.add(new ObservedServiceAction("install_copy", "Install separate copy", "route", "/discover?app=" + encode(service.catalogAppId()), null, false, ""));
        }
        if (!"owned_managed".equals(service.ownershipState())) {
            actions.add(new ObservedServiceAction("change_match", "Change app match", "api", "/api/observed-services/" + encode(service.id()) + "/match", "POST", false, ""));
        }
        return List.copyOf(actions);
    }

    private static boolean adoptable(ObservedService service) {
        return ObservedServiceSource.DOCKER.equals(service.source())
                && ("legacy_project_os".equals(service.ownershipState()) || "foreign_project_os".equals(service.ownershipState()));
    }

    private String failedInstallMetadata(String runtimePath, String composeProject, String message, List<String> logs) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("runtimePath", blankDefault(runtimePath, ""));
        metadata.put("composeProject", blankDefault(composeProject, ""));
        metadata.put("failureMessage", blankDefault(message, "Install failed after Project OS started creating runtime resources."));
        metadata.put("logTail", logs == null ? List.of() : logs.stream().skip(Math.max(0, logs.size() - 20)).toList());
        try {
            return objectMapper.writeValueAsString(metadata);
        } catch (java.io.IOException exception) {
            return "{}";
        }
    }

    private static Map<String, String> metadata(ObservedService service) {
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("metadataJson", service.metadataJson());
        return metadata;
    }

    private static List<String> containers(ObservedService service) {
        return List.of(service.fingerprint());
    }

    private boolean matchesNameOrUrl(ObservedService service, String normalizedAppId) {
        if (normalizedAppId.isBlank()) {
            return false;
        }
        return normalizeToken(service.displayName()).contains(normalizedAppId)
                || normalizeToken(service.url()).contains(normalizedAppId);
    }

    private static String normalizeToken(String value) {
        return value == null ? "" : value.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", "");
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static String cleanToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String blankDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
