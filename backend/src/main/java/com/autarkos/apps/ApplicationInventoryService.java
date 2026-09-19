package com.autarkos.apps;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.autarkos.api.AppOperationView;
import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;
import com.autarkos.api.AutarkOsIssueFactory;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.recovery.AppRecoveryModels;
import com.autarkos.apps.recovery.AppRecoveryService;
import com.autarkos.host.ObservedService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppRuntimeFiles;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.system.BetaScope;

@Service
public class ApplicationInventoryService {

    private final MarketplaceCatalogService catalogService;
    private final InstalledAppRepository installedAppRepository;
    private final ManagedAppAttestationService managedApps;
    private final AppRecoveryService recovery;

    public ApplicationInventoryService(
            MarketplaceCatalogService catalogService,
            InstalledAppRepository installedAppRepository,
            ManagedAppAttestationService managedApps,
            AppRecoveryService recovery) {
        this.catalogService = catalogService;
        this.installedAppRepository = installedAppRepository;
        this.managedApps = managedApps;
        this.recovery = recovery;
    }

    public List<ApplicationView> apps(
            List<ObservedService> evidence,
            List<AppRuntimeView> runtimes,
            Map<String, AppOperationView> operations) {
        Map<String, AppRuntimeView> runtimeByAppId = runtimes.stream()
                .collect(java.util.stream.Collectors.toMap(AppRuntimeView::appId, view -> view, (left, right) -> left));
        return catalogService.findAll().stream()
                .map(manifest -> appView(manifest, evidence, runtimeByAppId.get(manifest.id()),
                        operations.getOrDefault(manifest.id(), AppOperationView.idle())))
                .sorted(Comparator.comparing(ApplicationView::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private ApplicationView appView(
            ApplicationManifest manifest,
            List<ObservedService> evidence,
            AppRuntimeView runtime,
            AppOperationView operation) {
        InstalledApp registered = installedAppRepository.findAppById(manifest.id()).orElse(null);
        ManagedAppAttestationService.Result attestation = managedApps.attest(registered);
        InstalledApp storedRegistration = !attestation.managed() ? null
                : registered;
        AppRecoveryModels.RecoveryPlan recoveryPlan = attestation.managed()
                ? null
                : recovery.applicablePlan(manifest.id(), evidence).orElse(null);
        ObservedService registrationLost = matchingObserved(manifest.id(), evidence,
                service -> AutarkOsStates.OwnershipState.OWNED_MANAGED.equals(service.ownershipState())).orElse(null);
        ObservedService legacy = matchingObserved(manifest.id(), evidence, service -> AutarkOsStates.OwnershipState.LEGACY_AUTARK_OS.equals(service.ownershipState())).orElse(null);
        ObservedService managedElsewhere = matchingObserved(manifest.id(), evidence, service -> AutarkOsStates.OwnershipState.FOREIGN_AUTARK_OS.equals(service.ownershipState())).orElse(null);
        InstalledApp installed = storedRegistration != null && runtime != null ? storedRegistration : null;
        ObservedService failedInstall = matchingObserved(manifest.id(), evidence, service -> AutarkOsStates.OwnershipState.FAILED_INSTALL.equals(service.ownershipState())).orElse(null);
        ObservedService blocked = matchingObserved(manifest.id(), evidence, service -> AutarkOsStates.OwnershipState.UNKNOWN_CONFLICT.equals(service.ownershipState())).orElse(null);
        ObservedService found = matchingObserved(manifest.id(), evidence, service -> !AutarkOsStates.OwnershipState.OWNED_MANAGED.equals(service.ownershipState())).orElse(null);

        ApplicationRelationship relationship = relationship(
                installed, recoveryPlan, registered, registrationLost, legacy, managedElsewhere, failedInstall, blocked, found);
        ObservedService observedService = firstPresent(registrationLost, legacy, managedElsewhere, failedInstall, blocked, found);
        ManagedAppAttestationService.Result failedRegistration = registered != null && !attestation.managed()
                ? attestation
                : null;
        ApplicationEvidence applicationEvidence = evidence(observedService, failedRegistration);
        String reviewExistingHref = reviewExistingHref(manifest.id());
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
                attestation.managed() ? attestation.ownership().appInstanceId() : "",
                operation,
                relationship == ApplicationRelationship.MANAGED ? issues(runtime) : List.of(),
                relationshipLabel(relationship),
                relationshipDescription(relationship, applicationEvidence, failedRegistration),
                statusTone(relationship),
                cardTone(relationship),
                primaryAction,
                availableActions(manifest.id(), relationship, installed, runtime, operation, observedService, reviewExistingHref),
                relationship == ApplicationRelationship.MANAGED ? runtime : null,
                applicationEvidence);
    }

    private ApplicationRelationship relationship(
            InstalledApp installed,
            AppRecoveryModels.RecoveryPlan recoveryPlan,
            InstalledApp storedRegistration,
            ObservedService registrationLost,
            ObservedService legacy,
            ObservedService managedElsewhere,
            ObservedService failedInstall,
            ObservedService blocked,
            ObservedService found) {
        if (installed != null) {
            return ApplicationRelationship.MANAGED;
        }
        if (recoveryPlan != null) {
            return ApplicationRelationship.RECOVERY_REQUIRED;
        }
        if (storedRegistration != null || registrationLost != null || legacy != null
                || managedElsewhere != null || failedInstall != null || blocked != null || found != null) {
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
        return evidence.stream()
                .filter(service -> appId.equals(service.catalogAppId()))
                .filter(ObservedService::catalogIdentityExplicit)
                .filter(predicate)
                .findFirst();
    }

    private List<ApplicationAction> availableActions(
            String appId,
            ApplicationRelationship relationship,
            InstalledApp installed,
            AppRuntimeView runtime,
            AppOperationView operation,
            ObservedService observedService,
            String reviewExistingHref) {
        return switch (relationship) {
            case MANAGED -> managedActions(installed, runtime, operation);
            case RECOVERY_REQUIRED -> recoveryActions(observedService, reviewExistingHref);
            case BLOCKED -> existingServiceActions(
                    observedService,
                    reviewExistingHref,
                    separateCopyAllowed(observedService),
                    appId);
            case AVAILABLE -> List.of(reviewSetup(appId));
        };
    }

    private List<ApplicationAction> managedActions(InstalledApp installed, AppRuntimeView runtime, AppOperationView operation) {
        if (runtime == null) {
            return List.of(manage(installed.appId()));
        }
        if (operation != null && !AutarkOsStates.OperationKind.IDLE.equals(operation.kind())
                && !AutarkOsStates.OperationKind.FAILED.equals(operation.kind())) {
            return List.of();
        }
        List<ApplicationAction> actions = new java.util.ArrayList<>();
        String openUrl = runtime.accessRoute() == null ? runtime.accessUrl() : firstPresent(
                runtime.accessRoute().privateUrl(), runtime.accessRoute().localUrl(), runtime.accessUrl());
        if (runtime.state() == ApplicationRuntimeState.READY && !openUrl.isBlank()) {
            actions.add(open(openUrl));
        }
        boolean stopped = runtime.state() == ApplicationRuntimeState.STOPPED;
        actions.add(post(stopped ? "start" : "stop", stopped ? "Start" : "Pause",
                "/api/apps/" + runtime.appId() + "/" + (stopped ? "start" : "stop"), false, ""));
        actions.add(post("restart", "Restart", "/api/apps/" + runtime.appId() + "/restart", false, ""));
        boolean composeAvailable = AppRuntimeFiles.hasComposeFile(runtime.runtimePath());
        String missingCompose = "The original Compose file is missing. This action needs the Compose configuration.";
        if (!composeAvailable) {
            actions.replaceAll(action -> List.of("start", "restart").contains(action.id())
                    ? post(action.id(), action.label(), action.href(), true, missingCompose)
                    : action);
            actions.add(post("settings", "Settings", "/api/apps/" + runtime.appId() + "/settings", true, missingCompose));
            actions.add(post("backup", "Backup", "/api/backups/apps/" + runtime.appId() + "/run", true,
                    "A normal app backup is unavailable because its runtime folder is missing. Use archive-first uninstall to preserve the container writable layer."));
        }
        if (runtime.state() == ApplicationRuntimeState.DEGRADED || runtime.state() == ApplicationRuntimeState.MISSING) {
            actions.add(post("repair", "Repair", "/api/apps/" + runtime.appId() + "/repair", !composeAvailable, composeAvailable ? "" : missingCompose));
        }
        return List.copyOf(actions);
    }

    private ApplicationAction post(String id, String label, String href, boolean disabled, String reason) {
        return new ApplicationAction(id, label, "action", href, "POST", disabled, reason);
    }

    private List<AutarkOsIssue> issues(AppRuntimeView runtime) {
        if (runtime == null) {
            return List.of();
        }
        List<AutarkOsIssue> issues = new java.util.ArrayList<>();
        if (runtime.state() == ApplicationRuntimeState.MISSING) {
            issues.add(AutarkOsIssueFactory.appIssue(
                    "app-missing-" + runtime.appId(), runtime.appId(), "critical", "app_missing_container",
                    runtime.appName() + " is missing", "Autark-OS cannot find the container for this app.",
                    AutarkOsAction.post("repair-" + runtime.appId(), "Repair", "/api/apps/" + runtime.appId() + "/repair", false, false)));
        } else if (runtime.state() == ApplicationRuntimeState.DEGRADED) {
            issues.add(AutarkOsIssueFactory.appIssue(
                    "app-needs-attention-" + runtime.appId(), runtime.appId(), "warning", "app_needs_attention",
                    runtime.appName() + " needs attention", healthDetail(runtime),
                    AutarkOsAction.post("repair-" + runtime.appId(), "Repair", "/api/apps/" + runtime.appId() + "/repair", false, false)));
        }
        if (AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT.equals(runtime.backupProtection())) {
            issues.add(AutarkOsIssueFactory.backupIssue(
                    "backup-not-protected-" + runtime.appId(), runtime.appId(), "info",
                    AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT,
                    runtime.appName() + " is not backed up yet",
                    "Backup protection is enabled, but Autark-OS has not created a successful restore point for this app.",
                    AutarkOsAction.route("open-backups-" + runtime.appId(), "Open backups", "/backups")));
        }
        if (runtime.observedAccess() != null && runtime.desiredAccess() != null
                && runtime.desiredAccess().privateAccessRequired()
                && !"verified".equals(runtime.observedAccess().privateLinkStatus())) {
            String status = runtime.observedAccess().privateLinkStatus();
            issues.add(AutarkOsIssueFactory.accessIssue(
                    "private-access-" + runtime.appId(), runtime.appId(), "waiting".equals(status) ? "info" : "warning",
                    "private_access_" + status, runtime.appName() + " private link needs setup",
                    healthDetail(runtime),
                    AutarkOsAction.post("repair-private-" + runtime.appId(), "Repair private link", "/api/apps/" + runtime.appId() + "/private-access/repair", false, false)));
        }
        return List.copyOf(issues);
    }

    private String healthDetail(AppRuntimeView runtime) {
        if (runtime.healthSnapshot() != null) {
            return firstPresent(runtime.healthSnapshot().detail(), runtime.healthSnapshot().message());
        }
        return "Review Diagnostics for the latest runtime evidence.";
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

    private List<ApplicationAction> recoveryActions(ObservedService observedService, String reviewExistingHref) {
        java.util.ArrayList<ApplicationAction> actions = new java.util.ArrayList<>();
        if (observedService != null && observedService.url() != null && !observedService.url().isBlank()) {
            actions.add(open(observedService.url()));
        }
        actions.add(new ApplicationAction("recover", "Recover app", "route", reviewExistingHref, null, false, ""));
        return List.copyOf(actions);
    }

    private boolean separateCopyAllowed(ObservedService observedService) {
        return observedService != null
                && !AutarkOsStates.OwnershipState.LEGACY_AUTARK_OS.equals(observedService.ownershipState())
                && !AutarkOsStates.OwnershipState.FOREIGN_AUTARK_OS.equals(observedService.ownershipState())
                && !AutarkOsStates.OwnershipState.OWNED_MANAGED.equals(observedService.ownershipState());
    }

    private ApplicationAction primaryAction(
            String appId,
            ApplicationRelationship relationship,
            InstalledApp installed,
            ObservedService observedService,
            String reviewExistingHref) {
        return switch (relationship) {
            case MANAGED -> manage(appId);
            case RECOVERY_REQUIRED -> new ApplicationAction("recover", "Recover app", "route", reviewExistingHref, null, false, "");
            case BLOCKED -> reviewExisting(reviewExistingHref);
            case AVAILABLE -> reviewSetup(appId);
        };
    }

    private String reviewExistingHref(String appId) {
        return "/apps?review=" + encode(appId);
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

    private String relationshipDescription(
            ApplicationRelationship relationship,
            ApplicationEvidence evidence,
            ManagedAppAttestationService.Result failedRegistration) {
        return switch (relationship) {
            case MANAGED -> "Managed by this Autark-OS installation.";
            case RECOVERY_REQUIRED -> "Autark-OS verified this installation's runtime and can restore its missing management records.";
            case BLOCKED -> failedRegistration != null
                    ? failedRegistration.message()
                    : evidence == null ? "A server resource blocks installation." : evidence.summary();
            case AVAILABLE -> "Ready to review before install.";
        };
    }

    private ApplicationEvidence evidence(
            ObservedService service,
            ManagedAppAttestationService.Result failedRegistration) {
        if (service == null) {
            return null;
        }
        Map<String, String> metadata = metadata(service.metadataJson());
        return new ApplicationEvidence(
                service.id(),
                service.source(),
                service.url(),
                service.accessScope(),
                service.ownershipState(),
                service.runtimeState(),
                failedRegistration == null ? evidenceLabel(service) : "Management incomplete",
                failedRegistration == null ? evidenceSummary(service) : failedRegistration.message(),
                metadata.getOrDefault("appInstanceId", ""),
                firstPresent(service.autarkOsInstanceId(), metadata.get("autarkOsInstanceId")),
                metadata.getOrDefault("runtimePath", ""),
                metadata.getOrDefault("composeProject", ""));
    }

    private String evidenceLabel(ObservedService service) {
        return switch (service.ownershipState()) {
            case AutarkOsStates.OwnershipState.OWNED_MANAGED -> "Registration missing";
            case AutarkOsStates.OwnershipState.LEGACY_AUTARK_OS -> "Previous installation";
            case AutarkOsStates.OwnershipState.FOREIGN_AUTARK_OS -> "Owned elsewhere";
            case AutarkOsStates.OwnershipState.FAILED_INSTALL -> "Install failed";
            default -> "Conflict";
        };
    }

    private String evidenceSummary(ObservedService service) {
        return switch (service.ownershipState()) {
            case AutarkOsStates.OwnershipState.OWNED_MANAGED -> "Autark-OS found this app's current runtime, but its managed registration is missing.";
            case AutarkOsStates.OwnershipState.LEGACY_AUTARK_OS -> "Autark-OS found resources from an earlier installation. They will remain unchanged during beta.";
            case AutarkOsStates.OwnershipState.FOREIGN_AUTARK_OS -> "This app belongs to another Autark-OS installation and will remain unchanged during beta.";
            case AutarkOsStates.OwnershipState.FAILED_INSTALL -> BetaScope.allowsInstall(service.catalogAppId())
                    ? "Autark-OS started creating this app but did not finish. Review setup or try the install again."
                    : "A previous installation did not finish. Existing resources have not been deleted.";
            default -> "A service already on this server may conflict with a managed installation.";
        };
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> metadata(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, Object> values = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map.class);
            return values.entrySet().stream()
                    .filter(entry -> entry.getValue() != null)
                    .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, entry -> String.valueOf(entry.getValue())));
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            return Map.of();
        }
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

}
