package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.fileops.LocalAutarkOsFileOperations;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppInstanceViewProvider;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.AppRuntimeFiles;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.ReliabilityModels;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.ProjectSettingsRepository;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.RuntimeFileOperations;

@Service
public class BackupService {

    private static final DateTimeFormatter BACKUP_NAME_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final RuntimeLayout runtimeLayout;
    private final InstalledAppRepository installedAppRepository;
    private final BackupRepository backupRepository;
    private final ActivityLogService activityLogService;
    private final ProjectSettingsRepository settingsRepository;
    private final ProjectSettingsService projectSettingsService;
    private final AppInstanceViewProvider appInstanceViewProvider;
    private final BackupVerificationService backupVerificationService;
    private final BackupReportService backupReportService;
    private final BackupArchiveService backupArchiveService;
    private final RestorePlanner restorePlanner;
    private final RestoreExecutor restoreExecutor;
    private final BackupDestinationService backupDestinationService;
    private final AppLifecycleService appLifecycleService;
    private final MarketplaceCatalogService catalogService;
    private final AutarkOsFileOpsService fileOpsService;
    private final RecoveryOperationCoordinator recoveryOperations;
    private final BackupArchiveManifestService archiveManifestService = new BackupArchiveManifestService();

    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService) {
        this(runtimeLayout, installedAppRepository, backupRepository, activityLogService, settingsRepository, projectSettingsService, appLifecycleService, catalogService, () -> installedAppRepository.findAllApps().stream()
                .map(app -> new AppInstanceView(
                        app.appId(),
                        app.appId(),
                        app.appName(),
                        "",
                        "",
                        app.status(),
                        app.status(),
                        app.status(),
                        "owned",
                        app.accessUrl() == null || app.accessUrl().isBlank() ? "not_ready" : "local_ready",
                        AutarkOsStates.BackupState.DISABLED,
                        app.accessUrl(),
                        null,
                        List.of(),
                        List.of(),
                        new ReliabilityModels.AppRemediationView("watching", "Autark-OS is watching", app.appName() + " is ready. If it drifts, Autark-OS will try safe repair before asking you to intervene.", "No action needed", "success"),
                        Instant.now()))
                .toList(), new RuntimeFileOperations());
    }

    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, AppInstanceViewProvider appInstanceViewProvider, RuntimeFileOperations fileOperations) {
        this(runtimeLayout, installedAppRepository, backupRepository, activityLogService, settingsRepository, projectSettingsService, appLifecycleService, catalogService, appInstanceViewProvider, fileOperations, new AutarkOsFileOpsService(runtimeLayout, new LocalAutarkOsFileOperations()));
    }

    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, AppInstanceViewProvider appInstanceViewProvider, RuntimeFileOperations fileOperations, AutarkOsFileOpsService fileOpsService) {
        this(runtimeLayout, installedAppRepository, backupRepository, activityLogService, settingsRepository, projectSettingsService, appLifecycleService, catalogService, appInstanceViewProvider, fileOperations, fileOpsService, new BackupDestinationService(runtimeLayout, settingsRepository, fileOpsService), new RecoveryOperationCoordinator());
    }

    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, AppInstanceViewProvider appInstanceViewProvider, RuntimeFileOperations fileOperations, AutarkOsFileOpsService fileOpsService, BackupDestinationService backupDestinationService) {
        this(runtimeLayout, installedAppRepository, backupRepository, activityLogService, settingsRepository, projectSettingsService, appLifecycleService, catalogService, appInstanceViewProvider, fileOperations, fileOpsService, backupDestinationService, new RecoveryOperationCoordinator());
    }

    @Autowired
    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, AppInstanceViewProvider appInstanceViewProvider, RuntimeFileOperations fileOperations, AutarkOsFileOpsService fileOpsService, BackupDestinationService backupDestinationService, RecoveryOperationCoordinator recoveryOperations) {
        this.runtimeLayout = runtimeLayout;
        this.installedAppRepository = installedAppRepository;
        this.backupRepository = backupRepository;
        this.activityLogService = activityLogService;
        this.settingsRepository = settingsRepository;
        this.projectSettingsService = projectSettingsService;
        this.appInstanceViewProvider = appInstanceViewProvider;
        this.backupDestinationService = backupDestinationService;
        this.appLifecycleService = appLifecycleService;
        this.catalogService = catalogService;
        this.fileOpsService = fileOpsService;
        this.recoveryOperations = recoveryOperations;
        BackupContractService backupContractService = new BackupContractService(catalogService);
        this.backupVerificationService = new BackupVerificationService(backupRepository, installedAppRepository, backupContractService, activityLogService);
        this.backupReportService = new BackupReportService(installedAppRepository, backupRepository, projectSettingsService, catalogService, fileOperations, backupContractService, this::backupRoot, backupDestinationService);
        this.backupArchiveService = new BackupArchiveService(fileOperations, fileOpsService, this::backupRoot, backupDestinationService::approvedRootForArchive);
        RestoreSimulationService restoreSimulationService = new RestoreSimulationService(backupContractService, this::backupRoot);
        this.restorePlanner = new RestorePlanner(backupRepository, backupContractService, backupVerificationService, restoreSimulationService, this::managedInstalledApps, backupDestinationService::archiveAvailable);
        this.restoreExecutor = new RestoreExecutor(backupRepository, installedAppRepository, activityLogService, appLifecycleService, fileOperations, backupArchiveService, backupVerificationService, restorePlanner, this::backupRoot);
    }

    public BackupModels.BackupReport report() {
        reconcileUnavailableRestorePoints();
        return backupReportService.report(managedInstalledApps());
    }

    public BackupModels.BackupDestination destination() {
        return backupDestinationService.current();
    }

    public BackupModels.BackupDestination previewDestination(String path) {
        return backupDestinationService.preview(path);
    }

    public BackupModels.BackupDestination configureDestination(String path) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.BACKUP_DESTINATION_CHANGE,
                () -> backupDestinationService.configure(path));
    }

    public BackupModels.BackupRunResult run(String appId) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.APP_BACKUP,
                () -> runAppBackup(appId, "manual"));
    }

    public BackupModels.BackupRunResult runAutomatic() {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.ROUTINE_BACKUP,
                this::runAutomaticUnlocked);
    }

    private BackupModels.BackupRunResult runAutomaticUnlocked() {
        ProjectSettings settings = projectSettingsService.current();
        if (!settings.automaticBackupsEnabled()) {
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", "automatic", "", "", AutarkOsStates.RestorePointStatus.FAILED, 0, "Automatic backups are turned off.");
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        return runFullBackupUnlocked("automatic");
    }

    public Optional<BackupModels.BackupRunResult> runAutomaticIfDue() {
        return recoveryOperations.tryRunExclusive(
                        RecoveryOperationCoordinator.Operation.ROUTINE_BACKUP,
                        this::runAutomaticIfDueUnlocked)
                .orElseGet(Optional::empty);
    }

    private Optional<BackupModels.BackupRunResult> runAutomaticIfDueUnlocked() {
        ProjectSettings settings = projectSettingsService.current();
        if (!settings.automaticBackupsEnabled()) {
            return Optional.empty();
        }
        RestorePoint lastRoutine = backupRepository.recent(50).stream().map(RestorePoints::toDomain)
                .filter(point -> "automatic".equals(point.source()))
                .findFirst()
                .orElse(null);
        if (!backupReportService.routineBackupDue(settings, lastRoutine, Instant.now())) {
            return Optional.empty();
        }
        activityLogService.info("backup", "scheduled_backup_due", "Routine backup started", "Autark-OS started the scheduled routine backup window.");
        return Optional.of(runAutomaticUnlocked());
    }

    public BackupModels.BackupRunResult runFullBackup(String source) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.FULL_BACKUP,
                () -> runFullBackupUnlocked(source));
    }

    private BackupModels.BackupRunResult runFullBackupUnlocked(String source) {
        BackupModels.BackupDestination destinationState = backupDestinationService.current();
        if (!destinationState.ready()) {
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), "", "", AutarkOsStates.RestorePointStatus.FAILED, 0, destinationState.message());
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        List<InstalledApp> apps = managedInstalledApps();
        List<InstalledApp> protectedApps = apps.stream()
                .filter(app -> installedAppRepository.settingsFor(app.appId()).map(InstallModels.InstallSettings::backup).orElse(InstallModels.BackupPolicy.defaults()).enabled())
                .filter(app -> backupContract(app).reviewRequired() == false)
                .toList();
        List<InstalledApp> recoveryLimitedApps = apps.stream()
                .filter(app -> !AppRuntimeFiles.hasComposeFile(app.runtimePath()))
                .toList();
        if (!recoveryLimitedApps.isEmpty()) {
            String appNames = recoveryLimitedApps.stream().map(InstalledApp::appName).collect(java.util.stream.Collectors.joining(", "));
            String message = "Full backup is unavailable because the original Compose file is missing for: " + appNames + ". Review these apps in My Apps before running a full backup.";
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), "", "", AutarkOsStates.RestorePointStatus.FAILED, 0, message);
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        if (protectedApps.isEmpty()) {
            return new BackupModels.BackupRunResult("__full__", "All apps", "not_applicable", "No apps currently have a backup contract that Autark-OS can protect automatically.", null, Instant.now());
        }
        List<InstalledApp> stoppedApps = new java.util.ArrayList<>();
        try {
            // Validate every source and the destination before pausing the first app.
            backupArchiveService.validateFullBackup(protectedApps);
            stopAppsForBackup(protectedApps, stoppedApps);
            Files.createDirectories(backupRoot().resolve("full"));
            Path destination = backupRoot().resolve("full").resolve("autark-os-full-" + BACKUP_NAME_FORMAT.format(Instant.now()) + ".zip");
            long size = backupArchiveService.createFullArchive(protectedApps, destination);
            String included = protectedApps.stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.joining(","));
            BackupModels.BackupContract contract = new BackupModels.BackupContract("cold_file", 1, "Stopped app file backup", "standard", false, "All included apps were stopped before archiving.", List.of());
            RestorePoint point = recordVerifiedArchive("__full__", "All apps", "full", cleanSource(source), included, destination, size, "Full backup completed for " + protectedApps.size() + " app(s).", contract);
            point = backupVerificationService.verifyRestorePoint(point).restorePoint();
            if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus())) {
                return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.verificationMessage(), point, Instant.now());
            }
            enforceFullRetentionDays(projectSettingsService.current().backupRetentionDays());
            activityLogService.success("backup", cleanSource(source) + "_full_backup", "Full backup completed", point.message(), null);
            protectedApps.forEach(app -> installedAppRepository.recordEvent(app.appId(), "backup_completed", "Included in full " + cleanSource(source) + " backup."));
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.COMPLETED, point.message(), point, Instant.now());
        } catch (RuntimeException | IOException exception) {
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), protectedApps.stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.joining(",")), "", AutarkOsStates.RestorePointStatus.FAILED, 0, userMessage(exception));
            activityLogService.error("backup", cleanSource(source) + "_full_backup", "Full backup failed", userMessage(exception), null, exception);
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        } finally {
            restartAppsAfterBackup(stoppedApps);
        }
    }

    public RestoreModels.RestorePlan restorePlan(long restorePointId, String targetAppId) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.RESTORE_PLAN,
                () -> restorePlanner.restorePlan(restorePointId, targetAppId));
    }

    public BackupModels.BackupVerificationResult verify(long restorePointId) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.RESTORE_VERIFICATION,
                () -> backupVerificationService.verifyRestorePoint(findRestorePoint(restorePointId)).result());
    }

    public RestoreModels.RestoreResult restore(long restorePointId, String targetAppId) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.RESTORE,
                () -> restoreExecutor.restore(restorePointId, targetAppId));
    }

    /** Called by scheduled maintenance. Busy recovery work wins and cleanup retries later. */
    public int pruneRoutineRetention() {
        return recoveryOperations.tryRunExclusive(
                RecoveryOperationCoordinator.Operation.BACKUP_RETENTION,
                this::pruneRoutineRetentionUnlocked).orElse(0);
    }

    private int pruneRoutineRetentionUnlocked() {
        int removed = enforceFullRetentionDays(projectSettingsService.current().backupRetentionDays());
        for (InstalledApp app : managedInstalledApps()) {
            int retention = installedAppRepository.settingsFor(app.appId())
                    .map(InstallModels.InstallSettings::backup)
                    .orElse(InstallModels.BackupPolicy.defaults())
                    .retention();
            removed += enforceRetention(app.appId(), retention);
        }
        reconcileUnavailableRestorePoints();
        return removed;
    }

    private BackupModels.BackupRunResult runAppBackup(String appId, String backupSource) {
        InstalledApp app = installedAppRepository.findAppById(appId)
                .orElseThrow(() -> new InstallationException("App is not installed: " + appId));
        Path source = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        if (!AppRuntimeFiles.hasComposeFile(app.runtimePath())) {
            String message = app.appName() + " cannot use normal backups because its original Compose file is missing. Review it in My Apps and use archive-first cleanup if you no longer need the container.";
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "", AutarkOsStates.RestorePointStatus.FAILED, 0, message);
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        InstallModels.BackupPolicy policy = installedAppRepository.settingsFor(appId)
                .map(InstallModels.InstallSettings::backup)
                .orElse(InstallModels.BackupPolicy.defaults());
        if (!policy.enabled()) {
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "", AutarkOsStates.RestorePointStatus.FAILED, 0, "Backups are turned off for this app.");
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        BackupModels.BackupContract contract = backupContract(app);
        if (contract.reviewRequired()) {
            String message = app.appName() + " needs a stronger " + contract.label().toLowerCase() + " before Autark-OS can create a protection claim.";
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), "", AutarkOsStates.RestorePointStatus.FAILED, 0, message);
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, message, point, Instant.now());
        }
        BackupModels.BackupDestination destinationState = backupDestinationService.current();
        if (!destinationState.ready()) {
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), "", AutarkOsStates.RestorePointStatus.FAILED, 0, destinationState.message());
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        boolean stopped = false;
        try {
            stopAppForBackup(app);
            stopped = true;
            backupArchiveService.validateAppBackup(source);
            Files.createDirectories(backupRoot().resolve(app.appId()));
            Path destination = backupRoot().resolve(app.appId()).resolve(app.appId() + "-" + BACKUP_NAME_FORMAT.format(Instant.now()) + ".zip");
            long size = backupArchiveService.createAppArchive(app.appId(), destination);
            RestorePoint point = recordVerifiedArchive(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), destination, size, "Backup completed.", contract);
            point = backupVerificationService.verifyRestorePoint(point).restorePoint();
            if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus())) {
                return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, point.verificationMessage(), point, Instant.now());
            }
            enforceRetention(app.appId(), policy.retention());
            activityLogService.success("backup", cleanSource(backupSource) + "_app_backup", "Backup completed", app.appName() + " backup is ready.", app.appId());
            installedAppRepository.recordEvent(app.appId(), "backup_completed", "Backup completed.");
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.COMPLETED, "Backup completed.", point, Instant.now());
        } catch (RuntimeException | IOException exception) {
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), "", AutarkOsStates.RestorePointStatus.FAILED, 0, userMessage(exception));
            activityLogService.error("backup", cleanSource(backupSource) + "_app_backup", "Backup failed", userMessage(exception), app.appId(), exception);
            installedAppRepository.recordEvent(app.appId(), "backup_failed", userMessage(exception));
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, userMessage(exception), point, Instant.now());
        } finally {
            if (stopped) {
                restartAppAfterBackup(app);
            }
        }
    }

    private RestorePoint recordRestorePoint(String appId, String appName, String path, String status, long sizeBytes, String message) {
        return recordRestorePoint(appId, appName, "app", "manual", appId, path, status, sizeBytes, message);
    }

    private RestorePoint recordRestorePoint(String appId, String appName, String scope, String source, String includedAppIds, String path, String status, long sizeBytes, String message) {
        RestorePointEntity saved = backupRepository.save(RestorePoints.create(appId, appName, scope, source, includedAppIds, path, status, sizeBytes, message));
        return RestorePoints.toDomain(saved);
    }

    private RestorePoint recordVerifiedArchive(String appId, String appName, String scope, String source, String includedAppIds, Path archive, long sizeBytes, String message, BackupModels.BackupContract contract) throws IOException {
        String baseline = backupVerificationService.captureIntegrityBaseline(archive);
        backupVerificationService.writeArchiveManifest(
                archive, baseline, appId, appName, scope, source, includedAppIds, contract,
                appImageIdentity(includedAppIds));
        RestorePointEntity saved = backupRepository.save(RestorePoints.create(
                appId, appName, scope, source, includedAppIds, archive.toString(), AutarkOsStates.RestorePointStatus.COMPLETED,
                sizeBytes, message, baseline, contract.strategy(), contract.version()));
        return RestorePoints.toDomain(saved);
    }

    private BackupModels.BackupContract backupContract(InstalledApp app) {
        return new BackupContractService(catalogService).backupContract(app);
    }

    private String appImageIdentity(String includedAppIds) {
        return java.util.Arrays.stream(includedAppIds.split(","))
                .map(String::trim)
                .filter(appId -> !appId.isBlank())
                .map(appId -> catalogService.findById(appId)
                        .map(manifest -> manifest.id() + " version " + manifest.version() + " image " + manifest.runtime().image())
                        .orElse(appId + " (catalog identity unavailable)"))
                .collect(java.util.stream.Collectors.joining("; "));
    }

    private void stopAppsForBackup(List<InstalledApp> apps, List<InstalledApp> stoppedApps) {
        for (InstalledApp app : apps) {
            stopAppForBackup(app);
            stoppedApps.add(app);
        }
    }

    private void stopAppForBackup(InstalledApp app) {
        appLifecycleService.stopAndConfirm(app.appId());
    }

    private void restartAppsAfterBackup(List<InstalledApp> apps) {
        for (InstalledApp app : apps.reversed()) {
            restartAppAfterBackup(app);
        }
    }

    private void restartAppAfterBackup(InstalledApp app) {
        try {
            appLifecycleService.start(app.appId());
        } catch (RuntimeException exception) {
            activityLogService.warning("backup", "backup_restart_failed", "App needs attention after backup", "Autark-OS created the backup but could not restart " + app.appName() + ".", app.appId());
        }
    }

    private int enforceRetention(String appId, int retention) {
        List<RestorePoint> ordinary = backupRepository.forApp(appId, 200).stream()
                .map(RestorePoints::toDomain)
                .filter(point -> AutarkOsStates.RestorePointStatus.COMPLETED.equals(point.status()))
                // A person explicitly asked for manual backups and safety checkpoints.
                // Keep those until they choose to remove them; only routine points use the
                // app's count-based retention policy.
                .filter(point -> "automatic".equals(point.source()))
                .toList();
        return deleteEligibleRestorePoints(BackupRetentionPolicy.pruneByCount(ordinary, retention), appId, "app");
    }

    private int enforceFullRetentionDays(int retentionDays) {
        Instant cutoff = Instant.now().minus(Duration.ofDays(Math.max(retentionDays, 1)));
        List<RestorePoint> ordinary = backupRepository.recent(200).stream()
                .map(RestorePoints::toDomain)
                .filter(point -> "full".equals(point.scope()))
                .filter(point -> AutarkOsStates.RestorePointStatus.COMPLETED.equals(point.status()))
                .filter(point -> "automatic".equals(point.source()))
                .toList();
        return deleteEligibleRestorePoints(BackupRetentionPolicy.pruneBefore(ordinary, cutoff), "all apps", "full");
    }

    private int deleteEligibleRestorePoints(List<RestorePoint> candidates, String subject, String scope) {
        int removed = 0;
        for (RestorePoint candidate : candidates) {
            try {
                Path archive = Path.of(candidate.path());
                fileOpsService.deleteBackup(archive, backupDestinationService.approvedRootForArchive(archive));
                Files.deleteIfExists(archiveManifestService.manifestPath(archive));
                backupRepository.deleteById(candidate.id());
                removed++;
                activityLogService.info("backup", "backup_retention_pruned", "Removed expired restore point", "Autark-OS removed an older " + scope + " restore point for " + subject + " after keeping the newest verified recovery point.");
            } catch (RuntimeException | IOException exception) {
                activityLogService.warning("backup", "backup_retention_needs_attention", "Older restore point was kept", "Autark-OS could not safely remove an older restore point. It remains available for review.", "full".equals(scope) ? null : subject);
            }
        }
        return removed;
    }

    private RestorePoint findRestorePoint(long restorePointId) {
        return backupRepository.findById(restorePointId)
                .map(RestorePoints::toDomain)
                .orElseThrow(() -> new InstallationException("Restore point was not found."));
    }

    /**
     * A disconnected external drive is not proof that an archive disappeared.
     * Only mark a record unavailable when its containing folder is present but
     * the archive itself is gone. The record remains visible for support and
     * is no longer presented as a verified recovery point.
     */
    private void reconcileUnavailableRestorePoints() {
        backupRepository.recent(200).forEach(entity -> {
            if (!AutarkOsStates.RestorePointStatus.COMPLETED.equals(entity.status())
                    || AutarkOsStates.RestorePointStatus.FAILED.equals(entity.verificationStatus())
                    || entity.path() == null
                    || entity.path().isBlank()) {
                return;
            }
            try {
                Path archive = Path.of(entity.path());
                Path parent = archive.getParent();
                if (parent != null && Files.isDirectory(parent) && !Files.isRegularFile(archive)) {
                    entity.updateVerification(
                            AutarkOsStates.RestorePointStatus.FAILED,
                            "Backup archive is unavailable. Reconnect the original backup drive or create a new restore point.",
                            "low",
                            Instant.now().toString());
                    backupRepository.save(entity);
                    activityLogService.warning(
                            "backup",
                            "backup_archive_unavailable",
                            "Restore point needs attention",
                            entity.appName() + " has a restore record, but its archive is no longer available in the expected folder.",
                            "__full__".equals(entity.appId()) ? null : entity.appId());
                }
            } catch (RuntimeException ignored) {
                // A malformed legacy path remains visible for manual support review.
            }
        });
    }

    private List<InstalledApp> managedInstalledApps() {
        List<String> managedAppIds = appInstanceViewProvider.list().stream()
                .map(AppInstanceView::catalogAppId)
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .toList();
        return managedAppIds.stream()
                .map(installedAppRepository::findAppById)
                .flatMap(Optional::stream)
                .toList();
    }

    private Path backupRoot() {
        return backupDestinationService.activeRoot();
    }

    private String userMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Backup failed."
                : exception.getMessage();
    }

    private String cleanSource(String source) {
        if (source == null || source.isBlank()) {
            return "manual";
        }
        String normalized = source.trim().toLowerCase();
        return switch (normalized) {
            case "automatic", "pre_restore", "pre_uninstall" -> normalized;
            default -> "manual";
        };
    }
}
