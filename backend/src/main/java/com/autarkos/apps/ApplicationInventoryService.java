package com.autarkos.apps;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.host.ObservedServiceView;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.system.BetaScope;

@Service
public class ApplicationInventoryService {

    private final MarketplaceCatalogService catalogService;
    private final InstalledAppRepository installedAppRepository;
    private final ObservedServiceService observedServiceService;
    private final DockerOwnershipService dockerOwnershipService;
    private final com.autarkos.marketplace.install.AppInstanceViewProvider appViews;

    @org.springframework.beans.factory.annotation.Autowired
    public ApplicationInventoryService(
            MarketplaceCatalogService catalogService,
            InstalledAppRepository installedAppRepository,
            ObservedServiceService observedServiceService,
            DockerOwnershipService dockerOwnershipService,
            com.autarkos.marketplace.install.AppInstanceViewProvider appViews) {
        this.catalogService = catalogService;
        this.installedAppRepository = installedAppRepository;
        this.observedServiceService = observedServiceService;
        this.dockerOwnershipService = dockerOwnershipService;
        this.appViews = appViews;
    }

    public ApplicationInventoryService(MarketplaceCatalogService catalogService, InstalledAppRepository installedAppRepository,
            ObservedServiceService observedServiceService, DockerOwnershipService dockerOwnershipService) {
        this(catalogService, installedAppRepository, observedServiceService, dockerOwnershipService, List::of);
    }

    public List<ApplicationView> apps() {
        return apps(cachedObservedServices(), appViews.list(), List.of());
    }

    public List<ApplicationView> apps(List<ObservedService> evidence) {
        return apps(evidence, appViews.list(), List.of());
    }

    public List<ApplicationView> apps(
            List<ObservedService> evidence,
            List<com.autarkos.marketplace.install.AppInstanceView> managedViews,
            List<AppRuntimeView> runtimes) {
        var links = browserLinks(managedViews);
        Map<String, AppInstanceView> managedByAppId = managedViews.stream()
                .collect(java.util.stream.Collectors.toMap(AppInstanceView::catalogAppId, view -> view, (left, right) -> left));
        Map<String, AppRuntimeView> runtimeByAppId = runtimes.stream()
                .collect(java.util.stream.Collectors.toMap(AppRuntimeView::appId, view -> view, (left, right) -> left));
        return catalogService.findAll().stream()
                .map(manifest -> appView(manifest, evidence, links, managedByAppId.get(manifest.id()), runtimeByAppId.get(manifest.id())))
                .sorted(Comparator.comparing(ApplicationView::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public Optional<ApplicationView> app(String appId) {
        return apps().stream().filter(application -> application.id().equals(appId)).findFirst();
    }

    private java.util.Map<String, String> browserLinks(List<com.autarkos.marketplace.install.AppInstanceView> apps) {
        return apps.stream().collect(java.util.stream.Collectors.toMap(
                com.autarkos.marketplace.install.AppInstanceView::catalogAppId,
                app -> app.privateUrl() != null && !app.privateUrl().isBlank() ? app.privateUrl() : app.localUrl() == null ? "" : app.localUrl(),
                (first, second) -> first));
    }

    private List<ObservedService> cachedObservedServices() {
        if (observedServiceService == null) {
            return List.of();
        }
        return observedServiceService.observedServices();
    }

    private ApplicationView appView(
            ApplicationManifest manifest,
            List<ObservedService> evidence,
            java.util.Map<String, String> links,
            AppInstanceView managed,
            AppRuntimeView runtime) {
        InstalledApp storedRegistration = installedAppRepository.findAppById(manifest.id())
                .filter(app -> ownershipCompatible(manifest.id()))
                .map(app -> new InstalledApp(app.appId(), app.appName(), app.status(), app.runtimePath(), app.composeProject(),
                        links.getOrDefault(app.appId(), app.accessUrl()), app.installedAt()))
                .orElse(null);
        ObservedService registrationLost = matchingObserved(manifest.id(), evidence,
                service -> AutarkOsStates.OwnershipState.OWNED_MANAGED.equals(service.ownershipState())).orElse(null);
        ObservedService recoverable = matchingObserved(manifest.id(), evidence, service -> AutarkOsStates.OwnershipState.LEGACY_AUTARK_OS.equals(service.ownershipState())).orElse(null);
        ObservedService managedElsewhere = matchingObserved(manifest.id(), evidence, service -> AutarkOsStates.OwnershipState.FOREIGN_AUTARK_OS.equals(service.ownershipState())).orElse(null);
        InstalledApp installed = storedRegistration == null || recoverable != null || managedElsewhere != null
                || !com.autarkos.marketplace.install.AppRuntimeFiles.hasComposeFile(storedRegistration.runtimePath())
                        ? null : storedRegistration;
        ObservedService failedInstall = matchingObserved(manifest.id(), evidence, service -> AutarkOsStates.OwnershipState.FAILED_INSTALL.equals(service.ownershipState())).orElse(null);
        ObservedService blocked = matchingObserved(manifest.id(), evidence, service -> AutarkOsStates.OwnershipState.UNKNOWN_CONFLICT.equals(service.ownershipState())).orElse(null);
        ObservedService found = matchingObserved(manifest.id(), evidence, service -> !AutarkOsStates.OwnershipState.OWNED_MANAGED.equals(service.ownershipState())).orElse(null);

        ApplicationRelationship relationship = relationship(installed, storedRegistration, registrationLost, recoverable, managedElsewhere, failedInstall, blocked, found);
        ObservedService observedService = firstPresent(registrationLost, recoverable, managedElsewhere, failedInstall, blocked, found);
        ObservedServiceView observedView = observedService == null ? null : ObservedServiceService.toView(observedService);
        String reviewExistingHref = reviewExistingHref(observedService);
        ApplicationAction primaryAction = primaryAction(manifest.id(), relationship, installed, observedService, reviewExistingHref);
        return new ApplicationView(
                manifest.id(),
                manifest.name(),
                manifest.category(),
                manifest.image(),
                firstPresent(manifest.shortValue(), manifest.plainLanguage(), manifest.description()),
                firstPresent(manifest.plainLanguage(), manifest.description()),
                relationship,
                BetaScope.allowsInstall(manifest.id()) ? "installable" : "unavailable_in_beta",
                managed == null ? "" : managed.appInstanceId(),
                managed == null ? observedService == null ? "unknown" : observedService.runtimeState() : managed.runtimeState(),
                managed == null ? observedService == null ? "unowned" : observedService.ownershipState() : managed.ownershipState(),
                managed == null ? "not_ready" : managed.accessState(),
                managed == null ? AutarkOsStates.BackupState.DISABLED : managed.backupState(),
                managed == null ? List.of() : managed.issues(),
                relationshipLabel(relationship),
                relationshipDescription(relationship, observedView),
                statusTone(relationship),
                cardTone(relationship),
                duplicateWarningRequired(relationship),
                reviewExistingHref,
                primaryAction,
                availableActions(manifest.id(), relationship, installed, observedService, reviewExistingHref),
                relationship == ApplicationRelationship.MANAGED ? runtime : null,
                observedView);
    }

    private boolean ownershipCompatible(String appId) {
        Optional<RuntimeModels.InstalledAppOwnershipMetadata> metadata = installedAppRepository.ownershipFor(appId);
        if (metadata.isEmpty()) {
            return true;
        }
        RuntimeModels.InstalledAppOwnershipMetadata ownership = metadata.get();
        if ("owned".equals(ownership.ownershipStatus())) {
            String instanceId = ownership.autarkOsInstanceId();
            return instanceId == null || instanceId.isBlank() || instanceId.equals(dockerOwnershipService.currentIdentity().instanceId());
        }
        return false;
    }

    private ApplicationRelationship relationship(
            InstalledApp installed,
            InstalledApp storedRegistration,
            ObservedService registrationLost,
            ObservedService recoverable,
            ObservedService managedElsewhere,
            ObservedService failedInstall,
            ObservedService blocked,
            ObservedService found) {
        if (installed != null) {
            return ApplicationRelationship.MANAGED;
        }
        if (storedRegistration != null || registrationLost != null || recoverable != null || managedElsewhere != null) {
            return ApplicationRelationship.RECOVERY_REQUIRED;
        }
        if (failedInstall != null || blocked != null || found != null) {
            return ApplicationRelationship.BLOCKED;
        }
        return ApplicationRelationship.AVAILABLE;
    }

    private ObservedService firstPresent(ObservedService... services) {
        for (ObservedService service : services) {
            if (service != null) {
                return service;
            }
        }
        return null;
    }

    private Optional<ObservedService> matchingObserved(String appId, List<ObservedService> evidence, java.util.function.Predicate<ObservedService> predicate) {
        String normalizedAppId = normalizeToken(appId);
        return evidence.stream()
                .filter(service -> appId.equals(service.catalogAppId()) || matchesCatalogAppName(service, normalizedAppId))
                .filter(predicate)
                .findFirst();
    }

    private boolean matchesCatalogAppName(ObservedService service, String normalizedAppId) {
        if (service.catalogAppId() != null && !service.catalogAppId().isBlank()) {
            return false;
        }
        if (normalizedAppId.isBlank()) {
            return false;
        }
        return normalizeToken(service.displayName()).contains(normalizedAppId)
                || normalizeToken(service.url()).contains(normalizedAppId);
    }

    private List<ApplicationAction> availableActions(
            String appId,
            ApplicationRelationship relationship,
            InstalledApp installed,
            ObservedService observedService,
            String reviewExistingHref) {
        return switch (relationship) {
            case MANAGED -> installedActions(installed);
            case RECOVERY_REQUIRED -> existingServiceActions(observedService, reviewExistingHref, false, appId);
            case BLOCKED -> existingServiceActions(observedService, reviewExistingHref, true, appId);
            case AVAILABLE -> List.of(reviewSetup(appId));
        };
    }

    private List<ApplicationAction> installedActions(InstalledApp installed) {
        if (installed.accessUrl() == null || installed.accessUrl().isBlank()) {
            return List.of(manage(installed.appId()));
        }
        return List.of(manage(installed.appId()), open(installed.accessUrl()));
    }

    private List<ApplicationAction> existingServiceActions(ObservedService observedService, String reviewExistingHref, boolean allowSeparateCopy, String appId) {
        java.util.ArrayList<ApplicationAction> actions = new java.util.ArrayList<>();
        if (observedService != null && observedService.url() != null && !observedService.url().isBlank()) {
            actions.add(open(observedService.url()));
        }
        actions.add(reviewExisting(reviewExistingHref));
        if (allowSeparateCopy) {
            actions.add(installCopy(appId));
        }
        return List.copyOf(actions);
    }

    private ApplicationAction primaryAction(
            String appId,
            ApplicationRelationship relationship,
            InstalledApp installed,
            ObservedService observedService,
            String reviewExistingHref) {
        return switch (relationship) {
            case MANAGED -> manage(appId);
            case RECOVERY_REQUIRED, BLOCKED -> reviewExisting(reviewExistingHref);
            case AVAILABLE -> reviewSetup(appId);
        };
    }

    private String reviewExistingHref(ObservedService observedService) {
        if (observedService != null) {
            return "/apps/found?service=" + encode(observedService.id());
        }
        return null;
    }

    private ApplicationAction reviewSetup(String appId) {
        if (!BetaScope.allowsInstall(appId)) {
            return new ApplicationAction("unavailable", "Not available in beta", "disabled", null, null, true,
                    BetaScope.INSTALL_UNAVAILABLE);
        }
        return new ApplicationAction("review_setup", "Review setup", "route", "/discover?app=" + encode(appId), null, false, "");
    }

    private ApplicationAction manage(String appId) {
        return new ApplicationAction("manage", "Manage", "route", myAppsFocusHref("managed", appId), null, false, "");
    }

    private ApplicationAction open(String url) {
        return new ApplicationAction("open", "Open", "external", url, null, false, "");
    }

    private ApplicationAction reviewExisting(String href) {
        return new ApplicationAction("review_existing", "Review existing service", "route", href, null, false, "");
    }

    private ApplicationAction installCopy(String appId) {
        if (!BetaScope.allowsInstall(appId)) {
            return reviewSetup(appId);
        }
        return new ApplicationAction("install_copy", "Install second copy anyway", "install", "/api/discover/apps/" + appId + "/install", "POST", false, "");
    }

    private String relationshipLabel(ApplicationRelationship relationship) {
        return switch (relationship) {
            case MANAGED -> "Installed";
            case RECOVERY_REQUIRED -> "Recovery required";
            case BLOCKED -> "Blocked";
            case AVAILABLE -> "Available";
        };
    }

    private String relationshipDescription(ApplicationRelationship relationship, ObservedServiceView evidence) {
        return switch (relationship) {
            case MANAGED -> "Managed by this Autark-OS installation.";
            case RECOVERY_REQUIRED -> evidence == null ? "Autark-OS found app resources that require recovery." : evidence.userStatusDescription();
            case BLOCKED -> evidence == null ? "A server resource blocks installation." : evidence.userStatusDescription();
            case AVAILABLE -> "Ready to review before install.";
        };
    }

    private String statusTone(ApplicationRelationship relationship) {
        return switch (relationship) {
            case MANAGED -> "success";
            case RECOVERY_REQUIRED -> "warning";
            case BLOCKED -> "danger";
            case AVAILABLE -> "neutral";
        };
    }

    private String cardTone(ApplicationRelationship relationship) {
        return switch (relationship) {
            case MANAGED -> "success";
            case RECOVERY_REQUIRED -> "warning";
            case BLOCKED -> "danger";
            case AVAILABLE -> "neutral";
        };
    }

    private boolean duplicateWarningRequired(ApplicationRelationship relationship) {
        return relationship == ApplicationRelationship.BLOCKED;
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }

    private String myAppsFocusHref(String kind, String id) {
        return "/apps?focus=" + encode(kind + ":" + id) + "&panel=manage";
    }

    private String normalizeToken(String value) {
        return value == null ? "" : value.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", "");
    }
}
