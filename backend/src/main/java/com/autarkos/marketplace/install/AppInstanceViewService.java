package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;
import com.autarkos.api.AutarkOsIssueFactory;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.backups.BackupRepository;
import com.autarkos.backups.RestorePoint;
import com.autarkos.backups.RestorePoints;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.ReliabilityModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.network.tailscale.TailscaleService;

@Service
public class AppInstanceViewService implements AppInstanceViewProvider {

    private final InstalledAppRepository repository;
    private final AppReconciliationService reconciliationService;
    private final MarketplaceCatalogService catalogService;
    private final BackupRepository backupRepository;
    private final PrivateAccessStateResolver privateAccessStateResolver;

    public AppInstanceViewService(
            InstalledAppRepository repository,
            AppReconciliationService reconciliationService,
            MarketplaceCatalogService catalogService,
            BackupRepository backupRepository,
            TailscaleService tailscaleService) {
        this.repository = repository;
        this.reconciliationService = reconciliationService;
        this.catalogService = catalogService;
        this.backupRepository = backupRepository;
        this.privateAccessStateResolver = new PrivateAccessStateResolver(repository, tailscaleService);
    }

    public List<AppInstanceView> list() {
        return reconciliationService.reconcile().stream()
                .filter(this::userFacingManagedApp)
                .map(this::view)
                .toList();
    }

    private boolean userFacingManagedApp(AppReconciliationItem item) {
        return item.ownership() == DockerResourceOwnership.OWNED
                && repository.findAppById(item.appId()).isPresent();
    }

    private AppInstanceView view(AppReconciliationItem item) {
        InstalledApp app = repository.findAppById(item.appId()).orElse(null);
        RuntimeModels.InstalledAppOwnershipMetadata ownership = repository.ownershipFor(item.appId()).orElse(null);
        InstallModels.InstallSettings settings = repository.settingsFor(item.appId()).orElse(null);
        ApplicationManifest manifest = catalogService.findById(item.appId()).orElse(null);
        String backupState = backupState(item.appId(), settings);
        String localUrl = firstPresent(settings == null ? null : settings.accessUrl(), app == null ? null : app.accessUrl());
        PrivateAccessState privateAccess = privateAccessStateResolver.resolve(item.appId(), settings, localUrl);
        String privateUrl = privateAccess.verified() ? privateAccess.verifiedPrivateUrl() : null;
        List<AutarkOsIssue> issues = issues(item, app, backupState);
        privateAccessIssue(item, privateAccess).ifPresent(issues::add);
        List<AutarkOsAction> actions = actions(item, app, localUrl, privateUrl);
        return new AppInstanceView(
                firstPresent(ownership == null ? null : ownership.appInstanceId(), item.appId()),
                firstPresent(ownership == null ? null : ownership.catalogAppId(), item.appId()),
                manifest == null ? item.appName() : manifest.name(),
                manifest == null ? "" : manifest.category(),
                manifest == null ? "" : manifest.image(),
                item.status(),
                firstPresent(ownership == null ? null : ownership.installState(), app == null ? "unregistered" : app.status()),
                runtimeState(item.status()),
                ownershipState(item.ownership()),
                accessState(item.status(), localUrl, privateAccess),
                backupState,
                localUrl,
                privateUrl,
                issues,
                actions,
                remediation(item, backupState, settings),
                Instant.now());
    }

    private ReliabilityModels.AppRemediationView remediation(AppReconciliationItem item, String backupState, InstallModels.InstallSettings settings) {
        String lastRepairStatus = settings == null ? null : settings.lastRepairStatus();
        boolean autoRepairEnabled = settings == null || settings.autoRepairEnabled();
        boolean hasRestorePoint = AutarkOsStates.BackupState.PROTECTED_BY_RESTORE_POINT.equals(backupState);
        return AppRemediationPolicy.remediation(
                item.appName(),
                item.status(),
                lastRepairStatus,
                autoRepairEnabled,
                hasRestorePoint,
                needsUserAction(item.status()));
    }

    private List<AutarkOsIssue> issues(AppReconciliationItem item, InstalledApp app, String backupState) {
        List<AutarkOsIssue> issues = new ArrayList<>();
        if (AutarkOsStates.AppStatus.MISSING.equals(item.status())) {
            issues.add(AutarkOsIssueFactory.appIssue(
                    "app-missing-" + item.appId(),
                    item.appId(),
                    "critical",
                    "app_missing_container",
                    item.appName() + " is missing",
                    "Autark-OS cannot find the container for this app.",
                    AutarkOsAction.post("repair-" + item.appId(), "Repair", "/api/apps/" + item.appId() + "/repair", false, false)));
        } else if ("Managed elsewhere".equals(item.status())) {
            issues.add(AutarkOsIssueFactory.appIssue(
                    "app-managed-elsewhere-" + item.appId(),
                    item.appId(),
                    "warning",
                    "app_managed_elsewhere",
                    item.appName() + " is managed elsewhere",
                    "Autark-OS found this app, but it belongs to another Autark-OS instance or an older unscoped install.",
                    AutarkOsAction.route("view-diagnostics-" + item.appId(), "View diagnostics", "/diagnostics")));
        } else if (AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(item.status())) {
            issues.add(AutarkOsIssueFactory.appIssue(
                    "app-needs-attention-" + item.appId(),
                    item.appId(),
                    "warning",
                    "app_needs_attention",
                    item.appName() + " needs attention",
                    item.detail(),
                    app == null ? null : AutarkOsAction.post("repair-" + item.appId(), "Repair", "/api/apps/" + item.appId() + "/repair", false, false)));
        } else if ("Needs setup".equals(item.status())) {
            issues.add(AutarkOsIssueFactory.appIssue(
                    "app-needs-setup-" + item.appId(),
                    item.appId(),
                    "info",
                    "app_needs_setup",
                    item.appName() + " needs setup",
                    "Autark-OS found app resources without a complete installed app record.",
                    AutarkOsAction.route("view-diagnostics-" + item.appId(), "View diagnostics", "/diagnostics")));
        }
        if (AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT.equals(backupState)) {
            issues.add(AutarkOsIssueFactory.backupIssue(
                    "backup-not-protected-" + item.appId(),
                    item.appId(),
                    "info",
                    AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT,
                    item.appName() + " is not backed up yet",
                    "Backup protection is enabled, but Autark-OS has not created a successful restore point for this app.",
                    AutarkOsAction.route("open-backups-" + item.appId(), "Open backups", "/backups")));
        } else if ("backup_failed".equals(backupState)) {
            issues.add(AutarkOsIssueFactory.backupIssue(
                    "backup-failed-" + item.appId(),
                    item.appId(),
                    "warning",
                    "backup_failed",
                    item.appName() + " backup failed",
                    "The latest backup attempt for this app did not complete successfully.",
                    AutarkOsAction.route("open-backups-" + item.appId(), "Open backups", "/backups")));
        }
        return issues;
    }

    private List<AutarkOsAction> actions(AppReconciliationItem item, InstalledApp app, String localUrl, String privateUrl) {
        List<AutarkOsAction> actions = new ArrayList<>();
        if (AutarkOsStates.AppStatus.READY.equals(item.status()) && app != null) {
            actions.add(AutarkOsAction.get("open-" + item.appId(), "Open", firstPresent(privateUrl, localUrl, app.accessUrl())));
            actions.add(AutarkOsAction.post("restart-" + item.appId(), "Restart", "/api/apps/" + item.appId() + "/restart", false, false));
        } else if (AutarkOsStates.AppStatus.MISSING.equals(item.status()) && item.ownership() == DockerResourceOwnership.OWNED && app != null) {
            actions.add(AutarkOsAction.post("repair-" + item.appId(), "Repair", "/api/apps/" + item.appId() + "/repair", false, false));
            actions.add(AutarkOsAction.route("view-diagnostics-" + item.appId(), "View diagnostics", "/diagnostics"));
        } else if (AutarkOsStates.AppStatus.STOPPED.equals(item.status()) && app != null) {
            actions.add(AutarkOsAction.post("start-" + item.appId(), "Start", "/api/apps/" + item.appId() + "/start", false, false));
        } else if ("Managed elsewhere".equals(item.status()) || "Needs setup".equals(item.status())) {
            actions.add(AutarkOsAction.route("view-diagnostics-" + item.appId(), "View diagnostics", "/diagnostics"));
        }
        return actions;
    }

    private String runtimeState(String userStatus) {
        return switch (userStatus) {
            case AutarkOsStates.AppStatus.READY -> AutarkOsStates.ReadinessState.READY;
            case AutarkOsStates.AppStatus.STARTING -> AutarkOsStates.ReadinessState.STARTING;
            case AutarkOsStates.AppStatus.STOPPED -> AutarkOsStates.ReadinessState.STOPPED;
            case AutarkOsStates.AppStatus.MISSING -> "missing";
            case "Managed elsewhere" -> "foreign";
            case "Needs setup" -> "needs_setup";
            default -> "needs_attention";
        };
    }

    private boolean needsUserAction(String status) {
        return AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(status) || AutarkOsStates.AppStatus.UNAVAILABLE.equals(status) || AutarkOsStates.AppStatus.MISSING.equals(status);
    }

    private String ownershipState(DockerResourceOwnership ownership) {
        return switch (ownership) {
            case OWNED -> "owned";
            case FOREIGN -> "foreign";
            case LEGACY_UNSCOPED -> "legacy_unscoped";
            case UNMANAGED -> "unmanaged";
        };
    }

    private java.util.Optional<AutarkOsIssue> privateAccessIssue(AppReconciliationItem item, PrivateAccessState state) {
        if (state == null || !state.requested() || state.verified()) {
            return java.util.Optional.empty();
        }
        String severity = "waiting".equals(state.status()) ? "info" : "warning";
        return java.util.Optional.of(AutarkOsIssueFactory.accessIssue(
                "private-access-" + item.appId(),
                item.appId(),
                severity,
                "private_access_" + state.status(),
                item.appName() + " private link needs setup",
                state.detail(),
                AutarkOsAction.post("repair-private-" + item.appId(), "Repair private link", "/api/apps/" + item.appId() + "/private-access/repair", false, false)));
    }

    private String accessState(String userStatus, String localUrl, PrivateAccessState privateAccess) {
        if (AutarkOsStates.AppStatus.READY.equals(userStatus) && privateAccess != null && privateAccess.verified()) {
            return "private_ready";
        }
        if (AutarkOsStates.AppStatus.READY.equals(userStatus) && privateAccess != null && privateAccess.requested()) {
            return "waiting".equals(privateAccess.status()) ? "private_waiting" : "private_needs_setup";
        }
        if (AutarkOsStates.AppStatus.READY.equals(userStatus) && localUrl != null && !localUrl.isBlank()) {
            return "local_ready";
        }
        return "not_ready";
    }

    private String backupState(String appId, InstallModels.InstallSettings settings) {
        if (settings == null || settings.backup() == null || !settings.backup().enabled()) {
            return AutarkOsStates.BackupState.DISABLED;
        }
        List<RestorePoint> restorePoints = backupRepository.forApp(appId, 10).stream()
                .map(RestorePoints::toDomain)
                .toList();
        if (restorePoints.isEmpty()) {
            return AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT;
        }
        boolean hasCompletedRestorePoint = restorePoints.stream()
                .anyMatch(restorePoint -> AutarkOsStates.RestorePointStatus.COMPLETED.equalsIgnoreCase(restorePoint.status()));
        if (hasCompletedRestorePoint) {
            return AutarkOsStates.BackupState.PROTECTED_BY_RESTORE_POINT;
        }
        RestorePoint latest = restorePoints.getFirst();
        if (AutarkOsStates.RestorePointStatus.FAILED.equalsIgnoreCase(latest.status())) {
            return "backup_failed";
        }
        return AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT;
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }
}
