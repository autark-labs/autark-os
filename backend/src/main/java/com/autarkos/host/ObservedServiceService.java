package com.autarkos.host;

import com.autarkos.system.BetaScope;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.api.ApplicationBehaviorStates;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.system.AutarkOsIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ObservedServiceService {

    private final ObservedServiceRepository repository;
    private final ObservedServiceScanner scanner;
    private final MarketplaceCatalogService catalogService;
    private final Supplier<AutarkOsIdentity> currentIdentity;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public ObservedServiceService(
            ObservedServiceRepository repository,
            ObservedServiceScanner scanner,
            MarketplaceCatalogService catalogService,
            DockerOwnershipService ownershipService) {
        this.repository = repository;
        this.scanner = scanner;
        this.catalogService = catalogService;
        this.currentIdentity = ownershipService::currentIdentity;
    }

    public ObservedServiceService(ObservedServiceRepository repository, ObservedServiceScanner scanner) {
        this(repository, scanner, null, () -> new AutarkOsIdentity("", "autark-os", "", "", Instant.EPOCH, 1));
    }

    protected ObservedServiceService() {
        this(null, null, null, () -> new AutarkOsIdentity("", "autark-os", "", "", Instant.EPOCH, 1));
    }

    private ObservedServiceService(
            ObservedServiceRepository repository,
            ObservedServiceScanner scanner,
            MarketplaceCatalogService catalogService,
            Supplier<AutarkOsIdentity> currentIdentity) {
        this.repository = repository;
        this.scanner = scanner;
        this.catalogService = catalogService;
        this.currentIdentity = currentIdentity;
    }

    public List<ObservedServiceView> refresh() {
        Instant now = Instant.now();
        if (scanner != null) {
            List<ObservedService> scannedServices = scanner.scan(now);
            for (ObservedService scanned : scannedServices) {
                ObservedService merged = repository.findServiceBySourceAndFingerprint(scanned.source(), scanned.fingerprint())
                        .map(existing -> merge(existing, scanned))
                        .orElse(scanned);
                repository.upsert(merged);
            }
            List<String> dockerFingerprints = scannedServices.stream()
                    .filter(service -> HostModels.ObservedServiceSource.DOCKER.equals(service.source()))
                    .map(ObservedService::fingerprint)
                    .filter(fingerprint -> fingerprint != null && !fingerprint.isBlank())
                    .distinct()
                    .toList();
            repository.deleteDockerServicesNotIn(dockerFingerprints);
        }
        return list(true);
    }

    public List<ObservedServiceView> list(boolean includeIgnored) {
        return repository.findAllServices().stream()
                .filter(service -> includeIgnored || !"ignored".equals(service.userVisibility()))
                .map(ObservedServiceService::toView)
                .toList();
    }

    public List<ObservedService> observedServices() {
        return repository.findAllServices();
    }

    public ObservedServiceView get(String id) {
        return repository.findServiceById(id)
                .map(ObservedServiceService::toView)
                .orElseThrow(() -> new IllegalArgumentException("Unknown observed service: " + id));
    }

    public List<ObservedService> matchingCatalogServices(String appId) {
        String normalized = normalizeToken(appId);
        return repository.findAllServices().stream()
                .filter(service -> appId.equals(service.catalogAppId()) || (service.catalogAppId() == null && matchesNameOrUrl(service, normalized)))
                .toList();
    }

    public void recordFailedInstall(ApplicationManifest manifest, String accessUrl, String runtimePath, String composeProject, String message, List<String> logs) {
        if (repository == null || manifest == null) {
            return;
        }
        Instant now = Instant.now();
        AutarkOsIdentity identity = currentIdentity.get();
        repository.upsert(new ObservedService(
                "autark-os-install:" + manifest.id(),
                HostModels.ObservedServiceSource.AUTARK_OS_INSTALL,
                manifest.id(),
                manifest.name(),
                cleanToNull(accessUrl),
                blankDefault(manifest.category(), "Applications"),
                "LAN",
                manifest.id(),
                "autark_os_failed_install",
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

    private String displayName(ObservedService service) {
        if (catalogService != null && service.catalogAppId() != null && !service.catalogAppId().isBlank()) {
            Optional<ApplicationManifest> manifest = catalogService.findById(service.catalogAppId());
            if (manifest.isPresent()) {
                return manifest.get().name();
            }
        }
        return service.displayName() == null || service.displayName().isBlank() ? service.fingerprint() : titleCase(service.displayName());
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
        boolean managedByThisAutarkOs = "owned_managed".equals(service.ownershipState());
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
                ApplicationBehaviorStates.observedManagementState(userStatus, managedByThisAutarkOs),
                ApplicationBehaviorStates.observedReadinessState(service.runtimeState(), service.url()),
                ApplicationBehaviorStates.observedAttentionState(userStatus),
                service.ownershipState(),
                service.runtimeState(),
                managedByThisAutarkOs,
                recoveryCandidate(service),
                actions(service),
                metadata(service));
    }

    private ObservedService merge(ObservedService existing, ObservedService scanned) {
        boolean ignored = "ignored".equals(existing.userVisibility());
        return new ObservedService(
                existing.id(),
                existing.source(),
                existing.fingerprint(),
                scanned.displayName(),
                scanned.url(),
                scanned.category(),
                scanned.accessScope(),
                scanned.catalogAppId(),
                scanned.catalogMatchConfidence(),
                scanned.ownershipState(),
                ignored ? "ignored" : "observed",
                scanned.runtimeState(),
                existing.healthCheckEnabled(),
                scanned.autarkOsInstanceId(),
                existing.firstSeenAt(),
                scanned.lastSeenAt(),
                null,
                ignored ? existing.ignoredAt() : null,
                scanned.metadataJson());
    }

    private static String userStatus(ObservedService service) {
        if ("owned_managed".equals(service.ownershipState())) {
            return HostModels.ObservedServiceStatus.MANAGED;
        }
        if ("legacy_autark_os".equals(service.ownershipState())) {
            return HostModels.ObservedServiceStatus.RECOVERABLE;
        }
        if ("foreign_autark_os".equals(service.ownershipState())) {
            return HostModels.ObservedServiceStatus.OWNED_ELSEWHERE;
        }
        if ("unknown_conflict".equals(service.ownershipState())) {
            return HostModels.ObservedServiceStatus.CONFLICT;
        }
        if ("failed_install".equals(service.ownershipState())) {
            return HostModels.ObservedServiceStatus.FAILED_INSTALL;
        }
        return HostModels.ObservedServiceStatus.FOUND;
    }

    private static String userStatusLabel(String status) {
        return switch (status) {
            case HostModels.ObservedServiceStatus.MANAGED -> "Managed";
            case HostModels.ObservedServiceStatus.RECOVERABLE -> "Recoverable";
            case HostModels.ObservedServiceStatus.OWNED_ELSEWHERE -> "Owned elsewhere";
            case HostModels.ObservedServiceStatus.CONFLICT -> "Conflict";
            case HostModels.ObservedServiceStatus.FAILED_INSTALL -> "Install failed";
            default -> "Found";
        };
    }

    private static String userStatusDescription(ObservedService service, String status) {
        return switch (status) {
            case HostModels.ObservedServiceStatus.MANAGED -> "Managed by this Autark-OS installation.";
            case HostModels.ObservedServiceStatus.RECOVERABLE -> "Autark-OS found recoverable app metadata for this service.";
            case HostModels.ObservedServiceStatus.OWNED_ELSEWHERE -> "Owned by another Autark-OS installation.";
            case HostModels.ObservedServiceStatus.CONFLICT -> "This service may block installing a managed copy.";
            case HostModels.ObservedServiceStatus.FAILED_INSTALL -> BetaScope.allowsInstall(service.catalogAppId())
                    ? "Autark-OS started creating this app but did not finish. Review setup or click install again when ready."
                    : "A previous installation did not finish. New installs of this app are deferred in beta; existing resources have not been deleted.";
            default -> "Found on this server.";
        };
    }

    private static List<HostModels.ObservedServiceAction> actions(ObservedService service) {
        java.util.ArrayList<HostModels.ObservedServiceAction> actions = new java.util.ArrayList<>();
        if (service.url() != null && !service.url().isBlank()) {
            actions.add(new HostModels.ObservedServiceAction("open", "Open", "external", service.url(), null, false, ""));
        }
        if ("failed_install".equals(service.ownershipState())) {
            if (service.catalogAppId() != null && !service.catalogAppId().isBlank()) {
                actions.add(installAction(service.catalogAppId(), "review_setup", "Review setup"));
            }
            return List.copyOf(actions);
        }
        if (recoveryCandidate(service) && service.catalogAppId() != null && !service.catalogAppId().isBlank()) {
            actions.add(new HostModels.ObservedServiceAction("recovery_plan", "Review recovery plan", "api", "/api/app-recovery/" + encode(service.catalogAppId()) + "/plan", "GET", false, ""));
        }
        if (service.catalogAppId() != null && !"owned_managed".equals(service.ownershipState())) {
            actions.add(installAction(service.catalogAppId(), "install_copy", "Install separate copy"));
        }
        return List.copyOf(actions);
    }

    private static HostModels.ObservedServiceAction installAction(String appId, String id, String label) {
        if (!BetaScope.allowsInstall(appId)) {
            return new HostModels.ObservedServiceAction("unavailable", "Not available in beta", "disabled", null, null, true, BetaScope.INSTALL_UNAVAILABLE);
        }
        return new HostModels.ObservedServiceAction(id, label, "route", "/discover?app=" + encode(appId), null, false, "");
    }

    private static boolean recoveryCandidate(ObservedService service) {
        return HostModels.ObservedServiceSource.DOCKER.equals(service.source())
                && ("owned_managed".equals(service.ownershipState())
                        || "legacy_autark_os".equals(service.ownershipState())
                        || "foreign_autark_os".equals(service.ownershipState()));
    }

    private String failedInstallMetadata(String runtimePath, String composeProject, String message, List<String> logs) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("runtimePath", blankDefault(runtimePath, ""));
        metadata.put("composeProject", blankDefault(composeProject, ""));
        metadata.put("failureMessage", blankDefault(message, "Install failed after Autark-OS started creating runtime resources."));
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
