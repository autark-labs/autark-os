package com.autarkos.apps;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.backups.BackupRepository;
import com.autarkos.backups.RestorePoint;
import com.autarkos.backups.RestorePoints;
import com.autarkos.discover.DiscoverInstalledAppSummary;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.host.ObservedServiceView;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.InstallSettings;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppOwnershipMetadata;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.model.ApplicationManifest;

@Service
public class AppOwnershipService {

    private final MarketplaceCatalogService catalogService;
    private final InstalledAppRepository installedAppRepository;
    private final ObservedServiceService observedServiceService;
    private final DockerOwnershipService dockerOwnershipService;
    private final BackupRepository backupRepository;

    public AppOwnershipService(
            MarketplaceCatalogService catalogService,
            InstalledAppRepository installedAppRepository,
            ObservedServiceService observedServiceService,
            DockerOwnershipService dockerOwnershipService,
            BackupRepository backupRepository) {
        this.catalogService = catalogService;
        this.installedAppRepository = installedAppRepository;
        this.observedServiceService = observedServiceService;
        this.dockerOwnershipService = dockerOwnershipService;
        this.backupRepository = backupRepository;
    }

    public List<AppOwnershipView> apps() {
        return apps(cachedObservedServices());
    }

    public List<AppOwnershipView> apps(List<ObservedService> observedServices) {
        return catalogService.findAll().stream()
                .map(manifest -> appView(manifest, observedServices))
                .sorted(Comparator.comparing(AppOwnershipView::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public Optional<AppOwnershipView> app(String appId) {
        List<ObservedService> observedServices = cachedObservedServices();
        return catalogService.findById(appId)
                .map(manifest -> appView(manifest, observedServices));
    }

    private List<ObservedService> cachedObservedServices() {
        if (observedServiceService == null) {
            return List.of();
        }
        return observedServiceService.observedServices();
    }

    private AppOwnershipView appView(ApplicationManifest manifest, List<ObservedService> observedServices) {
        InstalledApp installed = installedAppRepository.findAppById(manifest.id())
                .filter(app -> ownershipCompatible(manifest.id()))
                .orElse(null);
        ObservedService recoverable = matchingObserved(manifest.id(), observedServices, service -> AutarkOsStates.OwnershipState.LEGACY_AUTARK_OS.equals(service.ownershipState())).orElse(null);
        ObservedService managedElsewhere = matchingObserved(manifest.id(), observedServices, service -> AutarkOsStates.OwnershipState.FOREIGN_AUTARK_OS.equals(service.ownershipState())).orElse(null);
        ObservedService failedInstall = matchingObserved(manifest.id(), observedServices, service -> AutarkOsStates.OwnershipState.FAILED_INSTALL.equals(service.ownershipState())).orElse(null);
        ObservedService blocked = matchingObserved(manifest.id(), observedServices, service -> AutarkOsStates.OwnershipState.UNKNOWN_CONFLICT.equals(service.ownershipState())).orElse(null);
        ObservedService pinned = matchingObserved(manifest.id(), observedServices, service -> "pinned".equals(service.userVisibility())).orElse(null);
        ObservedService found = matchingObserved(manifest.id(), observedServices, service -> !AutarkOsStates.OwnershipState.OWNED_MANAGED.equals(service.ownershipState())).orElse(null);

        AppOwnershipState state = state(installed, recoverable, managedElsewhere, failedInstall, blocked, pinned, found);
        ObservedService observedService = switch (state) {
            case RECOVERABLE -> recoverable;
            case MANAGED_ELSEWHERE -> managedElsewhere;
            case FAILED_INSTALL -> failedInstall;
            case BLOCKED -> blocked;
            case PINNED_EXTERNAL -> pinned;
            case FOUND_ON_SERVER -> found;
            default -> null;
        };
        ObservedServiceView observedView = observedService == null ? null : ObservedServiceService.toView(observedService);
        String reviewExistingHref = reviewExistingHref(observedService);
        AppOwnershipAction primaryAction = primaryAction(manifest.id(), state, installed, observedService, reviewExistingHref);
        return new AppOwnershipView(
                manifest.id(),
                manifest.name(),
                manifest.category(),
                manifest.image(),
                firstPresent(manifest.shortValue(), manifest.plainLanguage(), manifest.description()),
                firstPresent(manifest.plainLanguage(), manifest.description()),
                state,
                stateLabel(state),
                stateDescription(state, observedView),
                statusTone(state),
                cardTone(state),
                state == AppOwnershipState.INSTALLED_MANAGED,
                state == AppOwnershipState.INSTALLED_MANAGED,
                duplicateWarningRequired(state),
                reviewExistingHref,
                primaryAction,
                availableActions(manifest.id(), state, installed, observedService, reviewExistingHref),
                installed == null ? null : installedSummary(installed),
                observedView);
    }

    private DiscoverInstalledAppSummary installedSummary(InstalledApp app) {
        String backupState = backupState(app);
        boolean protectedByBackups = AutarkOsStates.BackupState.PROTECTED_BY_RESTORE_POINT.equals(backupState);
        return new DiscoverInstalledAppSummary(
                app.appId(),
                app.appName(),
                app.status(),
                app.accessUrl(),
                backupState,
                protectedByBackups,
                AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT.equals(backupState));
    }

    private String backupState(InstalledApp app) {
        InstallSettings settings = installedAppRepository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(app.accessUrl()));
        if (settings.backup() == null || !settings.backup().enabled()) {
            return AutarkOsStates.BackupState.DISABLED;
        }
        boolean hasCompletedRestorePoint = backupRepository.forApp(app.appId(), 10).stream()
                .map(RestorePoints::toDomain)
                .anyMatch(this::completedRestorePoint);
        return hasCompletedRestorePoint ? AutarkOsStates.BackupState.PROTECTED_BY_RESTORE_POINT : AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT;
    }

    private boolean completedRestorePoint(RestorePoint restorePoint) {
        return AutarkOsStates.RestorePointStatus.COMPLETED.equalsIgnoreCase(restorePoint.status());
    }

    private boolean ownershipCompatible(String appId) {
        Optional<InstalledAppOwnershipMetadata> metadata = installedAppRepository.ownershipFor(appId);
        if (metadata.isEmpty()) {
            return true;
        }
        InstalledAppOwnershipMetadata ownership = metadata.get();
        if ("owned".equals(ownership.ownershipStatus())) {
            String instanceId = ownership.autarkOsInstanceId();
            return instanceId == null || instanceId.isBlank() || instanceId.equals(dockerOwnershipService.currentIdentity().instanceId());
        }
        return false;
    }

    private AppOwnershipState state(
            InstalledApp installed,
            ObservedService recoverable,
            ObservedService managedElsewhere,
            ObservedService failedInstall,
            ObservedService blocked,
            ObservedService pinned,
            ObservedService found) {
        if (installed != null) {
            return AppOwnershipState.INSTALLED_MANAGED;
        }
        if (recoverable != null) {
            return AppOwnershipState.RECOVERABLE;
        }
        if (managedElsewhere != null) {
            return AppOwnershipState.MANAGED_ELSEWHERE;
        }
        if (failedInstall != null) {
            return AppOwnershipState.FAILED_INSTALL;
        }
        if (blocked != null) {
            return AppOwnershipState.BLOCKED;
        }
        if (pinned != null) {
            return AppOwnershipState.PINNED_EXTERNAL;
        }
        if (found != null) {
            return AppOwnershipState.FOUND_ON_SERVER;
        }
        return AppOwnershipState.AVAILABLE;
    }

    private Optional<ObservedService> matchingObserved(String appId, List<ObservedService> observedServices, java.util.function.Predicate<ObservedService> predicate) {
        String normalizedAppId = normalizeToken(appId);
        return observedServices.stream()
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

    private List<AppOwnershipAction> availableActions(
            String appId,
            AppOwnershipState state,
            InstalledApp installed,
            ObservedService observedService,
            String reviewExistingHref) {
        return switch (state) {
            case INSTALLED_MANAGED -> installedActions(installed);
            case FAILED_INSTALL -> List.of(reviewSetup(appId));
            case PINNED_EXTERNAL, FOUND_ON_SERVER, RECOVERABLE, MANAGED_ELSEWHERE, BLOCKED -> existingServiceActions(appId, observedService, reviewExistingHref);
            case COMING_SOON -> List.of(unavailable());
            default -> List.of(reviewSetup(appId));
        };
    }

    private List<AppOwnershipAction> installedActions(InstalledApp installed) {
        if (installed.accessUrl() == null || installed.accessUrl().isBlank()) {
            return List.of(manage(installed.appId()));
        }
        return List.of(manage(installed.appId()), open(installed.accessUrl()));
    }

    private List<AppOwnershipAction> existingServiceActions(String appId, ObservedService observedService, String reviewExistingHref) {
        if (observedService != null && observedService.url() != null && !observedService.url().isBlank()) {
            return List.of(open(observedService.url()), reviewExisting(reviewExistingHref), installCopy(appId));
        }
        return List.of(reviewExisting(reviewExistingHref), installCopy(appId));
    }

    private AppOwnershipAction primaryAction(
            String appId,
            AppOwnershipState state,
            InstalledApp installed,
            ObservedService observedService,
            String reviewExistingHref) {
        return switch (state) {
            case INSTALLED_MANAGED -> manage(appId);
            case FAILED_INSTALL -> reviewSetup(appId);
            case PINNED_EXTERNAL, FOUND_ON_SERVER, RECOVERABLE, MANAGED_ELSEWHERE, BLOCKED -> reviewExisting(reviewExistingHref);
            case COMING_SOON -> unavailable();
            default -> reviewSetup(appId);
        };
    }

    private String reviewExistingHref(ObservedService observedService) {
        if (observedService != null) {
            return myAppsFocusHref("service", observedService.id());
        }
        return null;
    }

    private AppOwnershipAction reviewSetup(String appId) {
        return new AppOwnershipAction("review_setup", "Review setup", "route", "/discover?app=" + encode(appId), null, false, "");
    }

    private AppOwnershipAction manage(String appId) {
        return new AppOwnershipAction("manage", "Manage", "route", myAppsFocusHref("managed", appId), null, false, "");
    }

    private AppOwnershipAction open(String url) {
        return new AppOwnershipAction("open", "Open", "external", url, null, false, "");
    }

    private AppOwnershipAction reviewExisting(String href) {
        return new AppOwnershipAction("review_existing", "Review existing service", "route", href, null, false, "");
    }

    private AppOwnershipAction installCopy(String appId) {
        return new AppOwnershipAction("install_copy", "Install second copy anyway", "install", "/api/discover/apps/" + appId + "/install", "POST", false, "");
    }

    private AppOwnershipAction unavailable() {
        return new AppOwnershipAction("unavailable", "Unavailable", "disabled", null, null, true, "This app is not available yet.");
    }

    private String stateLabel(AppOwnershipState state) {
        return switch (state) {
            case INSTALLED_MANAGED -> "Installed";
            case PINNED_EXTERNAL -> "Pinned";
            case FOUND_ON_SERVER -> "Found on server";
            case RECOVERABLE -> "Recoverable";
            case MANAGED_ELSEWHERE -> "Managed elsewhere";
            case BLOCKED -> "Blocked";
            case FAILED_INSTALL -> "Install failed";
            case COMING_SOON -> "Coming soon";
            default -> "Available";
        };
    }

    private String stateDescription(AppOwnershipState state, ObservedServiceView observedService) {
        return switch (state) {
            case INSTALLED_MANAGED -> "Managed by this Autark-OS installation.";
            case PINNED_EXTERNAL -> "Pinned to My Apps. Autark-OS can open it but does not manage its runtime.";
            case FOUND_ON_SERVER, RECOVERABLE, MANAGED_ELSEWHERE, BLOCKED, FAILED_INSTALL -> observedService == null ? "" : observedService.userStatusDescription();
            case COMING_SOON -> "This app is not available yet.";
            default -> "Ready to review before install.";
        };
    }

    private String statusTone(AppOwnershipState state) {
        return switch (state) {
            case INSTALLED_MANAGED -> "success";
            case PINNED_EXTERNAL -> "info";
            case RECOVERABLE, FAILED_INSTALL -> "warning";
            case MANAGED_ELSEWHERE, BLOCKED -> "danger";
            default -> "neutral";
        };
    }

    private String cardTone(AppOwnershipState state) {
        return switch (state) {
            case INSTALLED_MANAGED -> "success";
            case PINNED_EXTERNAL -> "info";
            case FOUND_ON_SERVER -> "observed";
            case RECOVERABLE, FAILED_INSTALL -> "warning";
            case MANAGED_ELSEWHERE, BLOCKED -> "danger";
            case COMING_SOON -> "muted";
            default -> "neutral";
        };
    }

    private boolean duplicateWarningRequired(AppOwnershipState state) {
        return state == AppOwnershipState.PINNED_EXTERNAL
                || state == AppOwnershipState.FOUND_ON_SERVER
                || state == AppOwnershipState.RECOVERABLE
                || state == AppOwnershipState.MANAGED_ELSEWHERE
                || state == AppOwnershipState.BLOCKED;
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
