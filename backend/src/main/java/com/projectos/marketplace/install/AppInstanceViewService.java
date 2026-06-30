package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.projectos.api.ProjectOsAction;
import com.projectos.api.ProjectOsIssue;
import com.projectos.api.ProjectOsIssueFactory;
import com.projectos.backups.BackupRepository;
import com.projectos.backups.RestorePoint;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.model.ApplicationManifest;

@Service
public class AppInstanceViewService implements AppInstanceViewProvider {

    private final InstalledAppRepository repository;
    private final AppReconciliationService reconciliationService;
    private final MarketplaceCatalogService catalogService;
    private final BackupRepository backupRepository;

    public AppInstanceViewService(
            InstalledAppRepository repository,
            AppReconciliationService reconciliationService,
            MarketplaceCatalogService catalogService,
            BackupRepository backupRepository) {
        this.repository = repository;
        this.reconciliationService = reconciliationService;
        this.catalogService = catalogService;
        this.backupRepository = backupRepository;
    }

    public List<AppInstanceView> list() {
        return reconciliationService.reconcile().stream()
                .filter(this::userFacingManagedApp)
                .map(this::view)
                .toList();
    }

    private boolean userFacingManagedApp(AppReconciliationItem item) {
        return item.ownership() == DockerResourceOwnership.OWNED
                && repository.findById(item.appId()).isPresent();
    }

    private AppInstanceView view(AppReconciliationItem item) {
        InstalledApp app = repository.findById(item.appId()).orElse(null);
        InstalledAppOwnershipMetadata ownership = repository.ownershipFor(item.appId()).orElse(null);
        InstallSettings settings = repository.settingsFor(item.appId()).orElse(null);
        ApplicationManifest manifest = catalogService.findById(item.appId()).orElse(null);
        String backupState = backupState(item.appId(), settings);
        List<ProjectOsIssue> issues = issues(item, app, backupState);
        String localUrl = firstPresent(settings == null ? null : settings.accessUrl(), app == null ? null : app.accessUrl());
        String privateUrl = settings == null ? null : settings.privateAccessUrl();
        List<ProjectOsAction> actions = actions(item, app, localUrl, privateUrl);
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
                accessState(item.status(), localUrl, privateUrl),
                backupState,
                localUrl,
                privateUrl,
                issues,
                actions,
                remediation(item, backupState, settings),
                Instant.now());
    }

    private AppRemediationView remediation(AppReconciliationItem item, String backupState, InstallSettings settings) {
        String lastRepairStatus = settings == null ? null : settings.lastRepairStatus();
        boolean autoRepairEnabled = settings == null || settings.autoRepairEnabled();
        boolean hasRestorePoint = "protected_by_restore_point".equals(backupState);
        return AppRemediationPolicy.remediation(
                item.appName(),
                item.status(),
                lastRepairStatus,
                autoRepairEnabled,
                hasRestorePoint,
                needsUserAction(item.status()));
    }

    private List<ProjectOsIssue> issues(AppReconciliationItem item, InstalledApp app, String backupState) {
        List<ProjectOsIssue> issues = new ArrayList<>();
        if ("Missing".equals(item.status())) {
            issues.add(ProjectOsIssueFactory.appIssue(
                    "app-missing-" + item.appId(),
                    item.appId(),
                    "critical",
                    "app_missing_container",
                    item.appName() + " is missing",
                    "Project OS cannot find the container for this app.",
                    ProjectOsAction.post("repair-" + item.appId(), "Repair", "/api/apps/" + item.appId() + "/repair", false, false)));
        } else if ("Managed elsewhere".equals(item.status())) {
            issues.add(ProjectOsIssueFactory.appIssue(
                    "app-managed-elsewhere-" + item.appId(),
                    item.appId(),
                    "warning",
                    "app_managed_elsewhere",
                    item.appName() + " is managed elsewhere",
                    "Project OS found this app, but it belongs to another Project OS instance or an older unscoped install.",
                    ProjectOsAction.route("view-diagnostics-" + item.appId(), "View diagnostics", "/diagnostics")));
        } else if ("Needs attention".equals(item.status())) {
            issues.add(ProjectOsIssueFactory.appIssue(
                    "app-needs-attention-" + item.appId(),
                    item.appId(),
                    "warning",
                    "app_needs_attention",
                    item.appName() + " needs attention",
                    item.detail(),
                    app == null ? null : ProjectOsAction.post("repair-" + item.appId(), "Repair", "/api/apps/" + item.appId() + "/repair", false, false)));
        } else if ("Needs setup".equals(item.status())) {
            issues.add(ProjectOsIssueFactory.appIssue(
                    "app-needs-setup-" + item.appId(),
                    item.appId(),
                    "info",
                    "app_needs_setup",
                    item.appName() + " needs setup",
                    "Project OS found app resources without a complete installed app record.",
                    ProjectOsAction.route("view-diagnostics-" + item.appId(), "View diagnostics", "/diagnostics")));
        }
        if ("backup_enabled_no_restore_point".equals(backupState)) {
            issues.add(ProjectOsIssueFactory.backupIssue(
                    "backup-not-protected-" + item.appId(),
                    item.appId(),
                    "info",
                    "backup_enabled_no_restore_point",
                    item.appName() + " is not backed up yet",
                    "Backup protection is enabled, but Project OS has not created a successful restore point for this app.",
                    ProjectOsAction.route("open-backups-" + item.appId(), "Open backups", "/backups")));
        } else if ("backup_failed".equals(backupState)) {
            issues.add(ProjectOsIssueFactory.backupIssue(
                    "backup-failed-" + item.appId(),
                    item.appId(),
                    "warning",
                    "backup_failed",
                    item.appName() + " backup failed",
                    "The latest backup attempt for this app did not complete successfully.",
                    ProjectOsAction.route("open-backups-" + item.appId(), "Open backups", "/backups")));
        }
        return issues;
    }

    private List<ProjectOsAction> actions(AppReconciliationItem item, InstalledApp app, String localUrl, String privateUrl) {
        List<ProjectOsAction> actions = new ArrayList<>();
        if ("Ready".equals(item.status()) && app != null) {
            actions.add(ProjectOsAction.get("open-" + item.appId(), "Open", firstPresent(privateUrl, localUrl, app.accessUrl())));
            actions.add(ProjectOsAction.post("restart-" + item.appId(), "Restart", "/api/apps/" + item.appId() + "/restart", false, false));
        } else if ("Missing".equals(item.status()) && item.ownership() == DockerResourceOwnership.OWNED && app != null) {
            actions.add(ProjectOsAction.post("repair-" + item.appId(), "Repair", "/api/apps/" + item.appId() + "/repair", false, false));
            actions.add(ProjectOsAction.route("view-diagnostics-" + item.appId(), "View diagnostics", "/diagnostics"));
        } else if ("Stopped".equals(item.status()) && app != null) {
            actions.add(ProjectOsAction.post("start-" + item.appId(), "Start", "/api/apps/" + item.appId() + "/start", false, false));
        } else if ("Managed elsewhere".equals(item.status()) || "Needs setup".equals(item.status())) {
            actions.add(ProjectOsAction.route("view-diagnostics-" + item.appId(), "View diagnostics", "/diagnostics"));
        }
        return actions;
    }

    private String runtimeState(String userStatus) {
        return switch (userStatus) {
            case "Ready" -> "running";
            case "Starting" -> "starting";
            case "Stopped" -> "stopped";
            case "Missing" -> "missing";
            case "Managed elsewhere" -> "foreign";
            case "Needs setup" -> "needs_setup";
            default -> "needs_attention";
        };
    }

    private boolean needsUserAction(String status) {
        return "Needs attention".equals(status) || "Unavailable".equals(status) || "Missing".equals(status);
    }

    private String ownershipState(DockerResourceOwnership ownership) {
        return switch (ownership) {
            case OWNED -> "owned";
            case FOREIGN -> "foreign";
            case LEGACY_UNSCOPED -> "legacy_unscoped";
            case UNMANAGED -> "unmanaged";
        };
    }

    private String accessState(String userStatus, String localUrl, String privateUrl) {
        if ("Ready".equals(userStatus) && privateUrl != null && !privateUrl.isBlank()) {
            return "private_ready";
        }
        if ("Ready".equals(userStatus) && localUrl != null && !localUrl.isBlank()) {
            return "local_ready";
        }
        return "not_ready";
    }

    private String backupState(String appId, InstallSettings settings) {
        if (settings == null || settings.backup() == null || !settings.backup().enabled()) {
            return "backup_disabled";
        }
        List<RestorePoint> restorePoints = backupRepository.forApp(appId, 10);
        if (restorePoints.isEmpty()) {
            return "backup_enabled_no_restore_point";
        }
        boolean hasCompletedRestorePoint = restorePoints.stream()
                .anyMatch(restorePoint -> "completed".equalsIgnoreCase(restorePoint.status()));
        if (hasCompletedRestorePoint) {
            return "protected_by_restore_point";
        }
        RestorePoint latest = restorePoints.getFirst();
        if ("failed".equalsIgnoreCase(latest.status())) {
            return "backup_failed";
        }
        return "backup_enabled_no_restore_point";
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
