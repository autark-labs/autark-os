package com.autarkos.backups;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppRuntimeFiles;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.system.ProjectSettingsService;

/** Binds a reviewed interruption scope to the state rechecked before any app is paused. */
@Service
public class BackupPlanService {

    private final BackupService backups;
    private final InstalledAppRepository installedApps;
    private final ManagedAppAttestationService managedApps;
    private final ProjectSettingsService settings;
    private final BackupContractService contracts;
    private final RecoveryOperationCoordinator operations;

    public BackupPlanService(BackupService backups, InstalledAppRepository installedApps,
            ManagedAppAttestationService managedApps, ProjectSettingsService settings,
            MarketplaceCatalogService catalog, RecoveryOperationCoordinator operations) {
        this.backups = backups;
        this.installedApps = installedApps;
        this.managedApps = managedApps;
        this.settings = settings;
        this.contracts = new BackupContractService(catalog);
        this.operations = operations;
    }

    public BackupModels.BackupPlan plan(String scope, String appId) {
        validateScope(scope, appId);
        List<String> blocked = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<String> fingerprint = new ArrayList<>(List.of("backup-review-v1", scope, appId == null ? "" : appId));
        List<InstalledApp> managed = managedApps.managedApps();
        List<InstalledApp> affected;
        if ("app".equals(scope)) {
            affected = managed.stream().filter(app -> app.appId().equals(appId)).toList();
            if (affected.isEmpty()) blocked.add("This app is no longer managed by this Autark-OS instance. Review it in My Apps.");
        } else {
            affected = backups.backupEligibleApps();
            fingerprint.add(Integer.toString(settings.current().backupRetentionDays()));
            for (InstalledApp app : managed) {
                if (affected.stream().noneMatch(included -> included.appId().equals(app.appId()))) {
                    warnings.add(app.appName() + " is excluded: " + (policy(app).enabled()
                            ? "its backup contract needs review." : "backups are turned off for this app."));
                }
                if (!AppRuntimeFiles.hasComposeFile(app.runtimePath())) {
                    blocked.add("The original Compose file is missing for " + app.appName() + ". Review this app in My Apps.");
                }
            }
        }
        if ("routine".equals(scope) && !settings.current().automaticBackupsEnabled()) {
            blocked.add("Routine backups are turned off. Enable them in Settings before running the routine.");
        }
        BackupModels.BackupDestination destination = backups.destination();
        fingerprint.addAll(java.util.Arrays.asList(destination.kind(), destination.configuredPath(), destination.deviceIdentity(), destination.mountPoint(), destination.filesystemType()));
        if (!destination.ready()) blocked.add(destination.message());
        if (affected.isEmpty()) blocked.add("There are no eligible managed apps to back up.");
        affected = affected.stream().sorted(Comparator.comparing(InstalledApp::appId)).toList();
        for (InstalledApp app : affected) {
            var policy = policy(app);
            var contract = contracts.backupContract(app);
            fingerprint.addAll(List.of(app.appId(), app.appName(), app.runtimePath(), app.composeProject(),
                    policy.toString(), contract.strategy(), Integer.toString(contract.version())));
            if (!policy.enabled()) blocked.add("Backups are turned off for " + app.appName() + ". Enable them in app settings first.");
            if (contract.reviewRequired()) blocked.add(app.appName() + ": " + contract.summary());
            installedApps.ownershipFor(app.appId()).ifPresentOrElse(ownership -> {
                fingerprint.add(ownership.appInstanceId());
                fingerprint.add(ownership.autarkOsInstanceId());
            }, () -> blocked.add("Ownership could not be confirmed for " + app.appName() + ". Review it in My Apps."));
            if (installedApps.settingsRecoveryFor(app.appId()).isPresent()) {
                blocked.add(app.appName() + " has an unfinished settings change. Use Repair in My Apps first.");
            }
            try {
                managedApps.durableStorage(app, true).protectedPaths().entrySet().stream()
                        .sorted(java.util.Map.Entry.comparingByKey())
                        .forEach(path -> fingerprint.add(path.getKey() + "=" + path.getValue().toAbsolutePath().normalize()));
            } catch (RuntimeException exception) {
                blocked.add("The managed data for " + app.appName() + " could not be confirmed. Review this app in My Apps before backing it up.");
            }
        }
        warnings.add("The listed apps will be unavailable while Autark-OS stops them, copies their data, and verifies the restore point.");
        warnings.add("Apps that were running will be resumed, including after a failed backup when ownership can be confirmed. Apps already paused will stay paused. Any app that cannot resume will need attention in Activity.");
        return new BackupModels.BackupPlan(scope, appId, digest(fingerprint), blocked.isEmpty(),
                affected.stream().map(app -> new BackupModels.BackupPlanApp(app.appId(), app.appName())).toList(),
                List.copyOf(warnings), List.copyOf(blocked), Instant.now());
    }

    public void requireReviewed(String scope, String appId, BackupModels.BackupRunRequest request) {
        if (request == null || request.planId() == null || request.planId().isBlank()) {
            throw new InstallationException("Review the affected apps and their interruption before starting this backup.");
        }
        BackupModels.BackupPlan current = plan(scope, appId);
        if (!current.executable()) throw new InstallationException(String.join(" ", current.blockedReasons()));
        if (!current.planId().equals(request.planId())) {
            throw new InstallationException("The backup scope or configuration changed. Review the affected apps again before starting the backup.");
        }
    }

    public BackupModels.BackupRunResult runReviewed(String scope, String appId, BackupModels.BackupRunRequest request) {
        RecoveryOperationCoordinator.Operation operation = switch (scope) {
            case "app" -> RecoveryOperationCoordinator.Operation.APP_BACKUP;
            case "full" -> RecoveryOperationCoordinator.Operation.FULL_BACKUP;
            case "routine" -> RecoveryOperationCoordinator.Operation.ROUTINE_BACKUP;
            default -> throw new InstallationException("Choose app, full, or routine backup scope.");
        };
        return operations.runExclusive(operation, () -> {
            requireReviewed(scope, appId, request);
            return switch (scope) {
                case "app" -> backups.run(appId);
                case "full" -> backups.runFullBackup("manual");
                default -> backups.runAutomatic();
            };
        });
    }

    private InstallModels.BackupPolicy policy(InstalledApp app) {
        return installedApps.settingsFor(app.appId()).map(InstallModels.InstallSettings::backup).orElse(InstallModels.BackupPolicy.defaults());
    }

    private void validateScope(String scope, String appId) {
        if (!List.of("app", "full", "routine").contains(scope)) throw new InstallationException("Choose app, full, or routine backup scope.");
        if ("app".equals(scope) != (appId != null && !appId.isBlank())) throw new InstallationException("An app backup requires one app; full and routine backups use their reviewed managed-app scope.");
    }

    private String digest(List<String> values) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String value : values) {
                byte[] bytes = String.valueOf(value).getBytes(StandardCharsets.UTF_8);
                digest.update(java.nio.ByteBuffer.allocate(Integer.BYTES).putInt(bytes.length).array());
                digest.update(bytes);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
