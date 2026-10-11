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

import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.AppRuntimeFiles;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.ProjectSettingsRepository;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.RuntimeFileOperations;

@Service
public class BackupService {

    private static final DateTimeFormatter BACKUP_NAME_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final InstalledAppRepository installedAppRepository;
    private final BackupRepository backupRepository;
    private final ActivityLogService activityLogService;
    private final ProjectSettingsService projectSettingsService;
    private final ManagedAppAttestationService managedApps;
    private final BackupVerificationService backupVerificationService;
    private final BackupReportService backupReportService;
    private final BackupArchiveService backupArchiveService;
    private final RestorePlanner restorePlanner;
    private final RestoreExecutor restoreExecutor;
    private final BackupDestinationService backupDestinationService;
    private final AppLifecycleService appLifecycleService;
    private final AutarkOsFileOpsService fileOpsService;
    private final RecoveryOperationCoordinator recoveryOperations;
    private final BackupJobs progress;
    private final BackupArchiveManifestService archiveManifestService = new BackupArchiveManifestService();

    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, ManagedAppAttestationService managedApps, RuntimeFileOperations fileOperations, AutarkOsFileOpsService fileOpsService, BackupDestinationService backupDestinationService, RecoveryOperationCoordinator recoveryOperations, com.autarkos.jobs.AutarkOsJobService jobs) {
        this.progress = new BackupJobs(jobs);
        this.installedAppRepository = installedAppRepository;
        this.backupRepository = backupRepository;
        this.activityLogService = activityLogService;
        this.projectSettingsService = projectSettingsService;
        this.managedApps = managedApps;
        this.backupDestinationService = backupDestinationService;
        this.appLifecycleService = appLifecycleService;
        this.fileOpsService = fileOpsService;
        this.recoveryOperations = recoveryOperations;
        BackupContractService backupContractService = new BackupContractService(catalogService);
        this.backupArchiveService = new BackupArchiveService(fileOperations, fileOpsService, backupDestinationService, backupRepository, installedAppRepository, catalogService, activityLogService);
        this.backupVerificationService = backupArchiveService.verification();
        this.backupReportService = new BackupReportService(installedAppRepository, backupRepository, projectSettingsService, catalogService, fileOperations, backupContractService, this::backupRoot, backupDestinationService, this::backupUnavailableReason, jobs);
        RestoreSimulationService restoreSimulationService = new RestoreSimulationService(backupContractService, this::backupRoot);
        this.restorePlanner = new RestorePlanner(backupRepository, backupContractService, backupVerificationService, restoreSimulationService, this::managedInstalledApps, backupDestinationService::archiveAvailable);
        this.restoreExecutor = new RestoreExecutor(backupRepository, installedAppRepository, activityLogService, appLifecycleService, backupArchiveService, backupVerificationService, restorePlanner, managedApps, progress);
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

    public Optional<BackupModels.BackupRunResult> runScheduledWindow() {
        progress.start("wait_for_recovery", "Waiting for other app recovery work");
        return recoveryOperations.runExclusiveWaiting(RecoveryOperationCoordinator.Operation.ROUTINE_BACKUP, () -> {
            progress.complete("wait_for_recovery", "The backup has exclusive access to app data.");
            progress.start("prepare_backup", "Validating backup scope and storage");
            if (!projectSettingsService.current().automaticBackupsEnabled()) {
                progress.complete("prepare_backup", "Automatic backups were turned off before this window could run. No archive was created.");
                return Optional.empty();
            }
            activityLogService.info("backup", "scheduled_backup_due", "Routine backup started", "Autark-OS started the scheduled routine backup window.");
            return Optional.of(runAutomaticUnlocked());
        });
    }

    public BackupModels.BackupRunResult runFullBackup(String source) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.FULL_BACKUP,
                () -> runFullBackupUnlocked(source));
    }

    /** Shared manual-backup eligibility; routine enrollment is deliberately independent. */
    public String backupUnavailableReason(InstalledApp app) {
        if (!AppRuntimeFiles.hasComposeFile(app.runtimePath())) {
            return "The original Compose file is missing. Review recovery in My Apps before backing up this app.";
        }
        var contract = backupContract(app);
        if (contract.reviewRequired()) return contract.summary();
        if (installedAppRepository.settingsRecoveryFor(app.appId()).isPresent()) {
            return "This app has an unfinished settings change. Use Repair in My Apps first.";
        }
        var destination = backupDestinationService.current();
        if (!destination.ready()) return destination.message();
        try {
            managedApps.durableStorage(app, true);
        } catch (RuntimeException failure) {
            return "The managed data for this app could not be confirmed. Review it in My Apps before backing it up.";
        }
        return "";
    }

    List<InstalledApp> backupEligibleApps(boolean routine) {
        return managedInstalledApps().stream()
                .filter(app -> !routine || installedAppRepository.settingsFor(app.appId()).map(InstallModels.InstallSettings::backup).orElse(InstallModels.BackupPolicy.defaults()).enabled())
                .filter(app -> !backupContract(app).reviewRequired())
                .toList();
    }

    Optional<BackupReportService.RoutineWindow> automaticBackupWindow() {
        return BackupReportService.routineWindow(projectSettingsService.current(), Instant.now());
    }

    private BackupModels.BackupRunResult runFullBackupUnlocked(String source) {
        progress.start("prepare_backup", "Validating backup scope and storage");
        List<InstalledApp> apps = managedInstalledApps();
        List<InstalledApp> protectedApps = backupEligibleApps("automatic".equals(source));
        String scopeSummary = backupScopeSummary(apps, protectedApps, "automatic".equals(source));
        BackupModels.BackupDestination destinationState = backupDestinationService.current();
        if (!destinationState.ready()) {
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), "", "", AutarkOsStates.RestorePointStatus.FAILED, 0, destinationState.message() + " " + scopeSummary);
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        List<String> blockers = protectedApps.stream()
                .map(app -> {
                    String reason = backupUnavailableReason(app);
                    return reason.isBlank() ? "" : app.appName() + ": " + reason;
                }).filter(reason -> !reason.isBlank()).toList();
        if (!blockers.isEmpty()) {
            String message = "Full backup is unavailable. " + String.join(" ", blockers) + " " + scopeSummary;
            progress.fail(message);
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), "", "", AutarkOsStates.RestorePointStatus.FAILED, 0, message);
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        if (protectedApps.isEmpty()) {
            String message = "No archive was created or verified. " + scopeSummary;
            progress.complete("prepare_backup", message);
            return new BackupModels.BackupRunResult("__full__", "All apps", "not_applicable", message, null, Instant.now());
        }
        List<AppLifecycleService.CheckpointState> checkpoints = new java.util.ArrayList<>();
        List<String> restartFailures = new java.util.ArrayList<>();
        BackupModels.BackupRunResult result;
        try {
            List<com.autarkos.marketplace.install.ManagedStorageContractService.Contract> storage = protectedApps.stream()
                    .map(app -> managedApps.durableStorage(app, true))
                    .toList();
            // Validate every source and the destination before pausing the first app.
            backupArchiveService.validateFullBackup(storage);
            progress.complete("prepare_backup", "Backup scope and storage validated.");
            progress.start("stop_apps", "Pausing included apps");
            for (InstalledApp app : protectedApps) {
                var state = appLifecycleService.prepareCheckpoint(app.appId());
                checkpoints.add(state);
                appLifecycleService.stopForCheckpoint(state);
            }
            protectedApps.forEach(appLifecycleService::confirmCheckpointStopped);
            progress.complete("stop_apps", "Included apps are stopped.");
            progress.start("copy_data", "Copying app data");
            Files.createDirectories(backupRoot().resolve("full"));
            Path destination = backupRoot().resolve("full").resolve("autark-os-full-" + BACKUP_NAME_FORMAT.format(Instant.now()) + "-" + java.util.UUID.randomUUID() + ".zip");
            long size = backupArchiveService.createFullArchive(storage, destination);
            progress.complete("copy_data", "App data archived.");
            progress.start("verify_backup", "Verifying restore point");
            String included = protectedApps.stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.joining(","));
            BackupModels.BackupContract contract = new BackupModels.BackupContract("cold_file", 1, "Stopped app file backup", "standard", false, "All included apps were stopped before archiving.", List.of());
            RestorePoint point = backupArchiveService.recordVerifiedArchive("__full__", "All apps", "full", cleanSource(source), included, destination, size, "Backup completed. " + scopeSummary, contract);
            if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus())) {
                progress.fail(point.verificationMessage());
                result = new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.verificationMessage(), point, Instant.now());
            } else {
                progress.complete("verify_backup", point.verificationMessage());
                progress.start("record_result", "Recording backup result");
                enforceFullRetentionDays(projectSettingsService.current().backupRetentionDays());
                activityLogService.success("backup", cleanSource(source) + "_full_backup", "Full backup completed", point.message(), null);
                protectedApps.forEach(app -> installedAppRepository.recordEvent(app.appId(), "backup_completed", "Included in full " + cleanSource(source) + " backup."));
                progress.complete("record_result", "Restore point and backup history saved.");
                result = new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.COMPLETED, point.message(), point, Instant.now());
            }
        } catch (RuntimeException | IOException exception) {
            progress.fail(userMessage(exception));
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), protectedApps.stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.joining(",")), "", AutarkOsStates.RestorePointStatus.FAILED, 0, userMessage(exception) + " " + scopeSummary);
            activityLogService.error("backup", cleanSource(source) + "_full_backup", "Full backup failed", userMessage(exception), null, exception);
            result = new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        } finally {
            restartFailures.addAll(restartAppsAfterBackup(checkpoints));
        }
        return withRestartOutcome(result, restartFailures);
    }

    private String backupScopeSummary(List<InstalledApp> all, List<InstalledApp> included, boolean routine) {
        String names = included.stream().map(InstalledApp::appName).collect(java.util.stream.Collectors.joining(", "));
        var exclusions = all.stream().filter(app -> included.stream().noneMatch(item -> item.appId().equals(app.appId())))
                .map(app -> app.appName() + ": " + (routine && !installedAppRepository.settingsFor(app.appId())
                        .map(InstallModels.InstallSettings::backup).orElse(InstallModels.BackupPolicy.defaults()).enabled()
                        ? "excluded from the routine" : backupContract(app).summary())).toList();
        return "Included: " + (names.isEmpty() ? "none" : names) + "." + (exclusions.isEmpty() ? "" : " Excluded: " + String.join("; ", exclusions));
    }

    public RestoreModels.RestorePlan restorePlan(long restorePointId, String targetAppId) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.RESTORE_PLAN,
                () -> restorePlanner.restorePlan(restorePointId, targetAppId));
    }

    public BackupModels.BackupVerificationResult verify(long restorePointId) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.RESTORE_VERIFICATION,
                () -> {
                    progress.start("load_restore_point", "Loading restore point");
                    var point = findRestorePoint(restorePointId);
                    progress.complete("load_restore_point", "Restore point loaded.");
                    progress.start("verify_archive", "Verifying backup archive");
                    var result = backupVerificationService.verifyRestorePoint(point).result();
                    if ("verified".equals(result.status())) progress.complete("verify_archive", result.message());
                    else progress.fail(result.message());
                    return result;
                });
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
        InstalledApp app = appLifecycleService.requireManagedApp(appId, "create a backup for");
        InstallModels.BackupPolicy policy = installedAppRepository.settingsFor(appId)
                .map(InstallModels.InstallSettings::backup)
                .orElse(InstallModels.BackupPolicy.defaults());
        progress.start("prepare_backup", "Validating backup scope and storage");
        BackupModels.BackupContract contract = backupContract(app);
        String unavailable = backupUnavailableReason(app);
        if (!unavailable.isBlank()) {
            progress.fail(unavailable);
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), "", AutarkOsStates.RestorePointStatus.FAILED, 0, unavailable);
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, unavailable, point, Instant.now());
        }
        AppLifecycleService.CheckpointState checkpoint = null;
        List<String> restartFailures = new java.util.ArrayList<>();
        BackupModels.BackupRunResult result;
        try {
            java.util.Map<String, Path> protectedPaths = managedApps.durableStorage(app, true).protectedPaths();
            backupArchiveService.validateAppBackup(protectedPaths);
            progress.complete("prepare_backup", "Backup scope and storage validated.");
            progress.start("stop_apps", "Pausing " + app.appName());
            checkpoint = appLifecycleService.prepareCheckpoint(appId);
            appLifecycleService.stopForCheckpoint(checkpoint);
            progress.complete("stop_apps", "App is stopped.");
            progress.start("copy_data", "Copying app data");
            Files.createDirectories(backupRoot().resolve(app.appId()));
            Path destination = backupRoot().resolve(app.appId()).resolve(app.appId() + "-" + BACKUP_NAME_FORMAT.format(Instant.now()) + "-" + java.util.UUID.randomUUID() + ".zip");
            long size = backupArchiveService.createArchive(app.appId(), protectedPaths, destination);
            progress.complete("copy_data", "App data archived.");
            progress.start("verify_backup", "Verifying restore point");
            RestorePoint point = backupArchiveService.recordVerifiedArchive(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), destination, size, "Backup completed.", contract);
            if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus())) {
                progress.fail(point.verificationMessage());
                result = new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, point.verificationMessage(), point, Instant.now());
            } else {
                progress.complete("verify_backup", point.verificationMessage());
                progress.start("record_result", "Recording backup result");
                enforceRetention(app.appId(), policy.retention());
                activityLogService.success("backup", cleanSource(backupSource) + "_app_backup", "Backup completed", app.appName() + " backup is ready.", app.appId());
                installedAppRepository.recordEvent(app.appId(), "backup_completed", "Backup completed.");
                progress.complete("record_result", "Restore point and backup history saved.");
                result = new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.COMPLETED, "Backup completed.", point, Instant.now());
            }
        } catch (RuntimeException | IOException exception) {
            progress.fail(userMessage(exception));
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), "", AutarkOsStates.RestorePointStatus.FAILED, 0, userMessage(exception));
            activityLogService.error("backup", cleanSource(backupSource) + "_app_backup", "Backup failed", userMessage(exception), app.appId(), exception);
            installedAppRepository.recordEvent(app.appId(), "backup_failed", userMessage(exception));
            result = new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, userMessage(exception), point, Instant.now());
        } finally {
            if (checkpoint != null) restartFailures.addAll(restartAppsAfterBackup(List.of(checkpoint)));
        }
        return withRestartOutcome(result, restartFailures);
    }

    private RestorePoint recordRestorePoint(String appId, String appName, String path, String status, long sizeBytes, String message) {
        return recordRestorePoint(appId, appName, "app", "manual", appId, path, status, sizeBytes, message);
    }

    private RestorePoint recordRestorePoint(String appId, String appName, String scope, String source, String includedAppIds, String path, String status, long sizeBytes, String message) {
        RestorePointEntity saved = backupRepository.save(RestorePoints.create(appId, appName, scope, source, includedAppIds, path, status, sizeBytes, message));
        return RestorePoints.toDomain(saved);
    }

    private BackupModels.BackupContract backupContract(InstalledApp app) {
        return backupArchiveService.contract(app);
    }

    private List<String> restartAppsAfterBackup(List<AppLifecycleService.CheckpointState> checkpoints) {
        List<String> failures = new java.util.ArrayList<>();
        if (checkpoints.isEmpty()) return failures;
        progress.start("resume_apps", "Resuming apps that were running");
        for (var state : checkpoints.reversed()) {
            try {
                appLifecycleService.resumeAfterCheckpoint(state).ifPresent(failures::add);
            } catch (RuntimeException recordingFailure) {
                // A failed recovery write must not prevent recovery of the remaining apps.
                failures.add(state.app().appName() + " recovery could not be recorded. Review the app in My Apps.");
            }
        }
        if (failures.isEmpty()) progress.complete("resume_apps", "Previous app availability restored.");
        else progress.fail(String.join(" ", failures));
        return failures;
    }

    private BackupModels.BackupRunResult withRestartOutcome(BackupModels.BackupRunResult result, List<String> restartFailures) {
        if (restartFailures.isEmpty()) {
            return result;
        }
        String message = result.message() + " " + String.join(" ", restartFailures) + " Open My Apps to retry starting it.";
        String status = AutarkOsStates.RestorePointStatus.FAILED.equals(result.status())
                ? AutarkOsStates.RestorePointStatus.FAILED
                : "warning";
        return new BackupModels.BackupRunResult(result.appId(), result.appName(), status, message, result.restorePoint(), Instant.now());
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
        return managedApps.managedApps();
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
