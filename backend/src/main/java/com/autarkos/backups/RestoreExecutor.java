package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.AppActionResult;
import com.autarkos.marketplace.install.AppHealthSnapshot;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.system.RuntimeFileOperations;

class RestoreExecutor {

    private static final DateTimeFormatter BACKUP_NAME_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final BackupRepository backupRepository;
    private final InstalledAppRepository installedAppRepository;
    private final ActivityLogService activityLogService;
    private final AppLifecycleService appLifecycleService;
    private final RuntimeFileOperations fileOperations;
    private final BackupArchiveService backupArchiveService;
    private final BackupVerificationService backupVerificationService;
    private final RestorePlanner restorePlanner;
    private final Supplier<Path> backupRoot;

    RestoreExecutor(
            BackupRepository backupRepository,
            InstalledAppRepository installedAppRepository,
            ActivityLogService activityLogService,
            AppLifecycleService appLifecycleService,
            RuntimeFileOperations fileOperations,
            BackupArchiveService backupArchiveService,
            BackupVerificationService backupVerificationService,
            RestorePlanner restorePlanner,
            Supplier<Path> backupRoot) {
        this.backupRepository = backupRepository;
        this.installedAppRepository = installedAppRepository;
        this.activityLogService = activityLogService;
        this.appLifecycleService = appLifecycleService;
        this.fileOperations = fileOperations;
        this.backupArchiveService = backupArchiveService;
        this.backupVerificationService = backupVerificationService;
        this.restorePlanner = restorePlanner;
        this.backupRoot = backupRoot;
    }

    RestoreModels.RestoreResult restore(long restorePointId, String targetAppId) {
        RestoreModels.RestorePlan plan = restorePlanner.restorePlan(restorePointId, targetAppId);
        if (!plan.executable()) {
            throw new InstallationException("This restore point cannot be restored. Review the restore plan for details.");
        }
        RestorePoint point = backupRepository.findById(restorePointId)
                .map(RestorePoints::toDomain)
                .orElseThrow(() -> new InstallationException("Restore point was not found."));
        List<InstalledApp> apps = restorePlanner.affectedApps(point, targetAppId);
        List<String> logs = new ArrayList<>();
        List<RestoreAppResult> results = new ArrayList<>();
        for (InstalledApp app : apps) {
            results.add(restoreApp(point, app, logs));
        }
        List<RestoreAppResult> restartFailures = results.stream()
                .filter(result -> result.restartFailure() != null && !result.restartFailure().isBlank())
                .toList();
        if (!restartFailures.isEmpty()) {
            String message = restoreRestartWarningMessage(apps, restartFailures);
            activityLogService.warning("backup", "restore_restart_failed", "Restore needs attention", message, null);
            return new RestoreModels.RestoreResult(point.id(), AutarkOsStates.RestorePointStatus.WARNING, message, apps.stream().map(InstalledApp::appId).toList(), logs, Instant.now());
        }
        String message = plan.scope().equals("full")
                ? "Full restore completed for " + apps.size() + " app(s)."
                : "Restore completed for " + apps.getFirst().appName() + ".";
        activityLogService.success("backup", "restore_completed", message, String.join(", ", apps.stream().map(InstalledApp::appName).toList()), null);
        return new RestoreModels.RestoreResult(point.id(), AutarkOsStates.RestorePointStatus.COMPLETED, message, apps.stream().map(InstalledApp::appId).toList(), logs, Instant.now());
    }

    private RestoreAppResult restoreApp(RestorePoint point, InstalledApp app, List<String> logs) {
        Path destination = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        try {
            logs.add("Stopping " + app.appName() + ".");
            AppActionResult stop = appLifecycleService.stopAndConfirm(app.appId());
            logs.add(stop.message());
        } catch (RuntimeException exception) {
            String message = "Autark-OS could not stop " + app.appName() + ". No data was changed: " + userMessage(exception);
            logs.add(message);
            throw new InstallationException(message, exception);
        }
        Path safetyArchive = null;
        InstallationException restoreFailure = null;
        try {
            if (Files.exists(destination) && fileOperations.directorySize(destination) > 0) {
                Files.createDirectories(backupRoot.get().resolve("pre-restore"));
                safetyArchive = backupRoot.get().resolve("pre-restore").resolve(app.appId() + "-pre-restore-" + BACKUP_NAME_FORMAT.format(Instant.now()) + ".zip");
                long size = backupArchiveService.createSafetyArchive(app.appId(), safetyArchive);
                BackupModels.BackupContract safetyContract = new BackupModels.BackupContract(
                        "cold_file", 1, "Stopped app file backup", "standard", false,
                        "Safety checkpoint created before restore.", List.of());
                String baseline = backupVerificationService.captureIntegrityBaseline(safetyArchive);
                backupVerificationService.writeArchiveManifest(
                        safetyArchive, baseline, app.appId(), app.appName(), "app", "pre_restore", app.appId(), safetyContract);
                RestorePoint safetyPoint = RestorePoints.toDomain(backupRepository.save(RestorePoints.create(
                        app.appId(), app.appName(), "app", "pre_restore", app.appId(), safetyArchive.toString(),
                        AutarkOsStates.RestorePointStatus.COMPLETED, size, "Safety checkpoint created before restore.",
                        baseline, safetyContract.strategy(), safetyContract.version())));
                safetyPoint = backupVerificationService.verifyRestorePoint(safetyPoint).restorePoint();
                if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(safetyPoint.verificationStatus())) {
                    throw new InstallationException("Autark-OS could not verify the safety checkpoint before restoring.");
                }
                logs.add("Created safety backup for " + app.appName() + ".");
            }
            backupArchiveService.restoreAppData(Path.of(point.path()), point.scope(), app.appId());
            installedAppRepository.recordEvent(app.appId(), "restore_completed", "Restored data from restore point #" + point.id() + ".");
            activityLogService.success("backup", "restore_app", "Restored " + app.appName(), "Restored data from restore point #" + point.id() + ".", app.appId());
            logs.add("Restored " + app.appName() + ".");
        } catch (RuntimeException | IOException exception) {
            installedAppRepository.recordEvent(app.appId(), "restore_failed", userMessage(exception));
            activityLogService.error("backup", "restore_app", "Restore failed for " + app.appName(), userMessage(exception), app.appId(), exception);
            restoreFailure = new InstallationException("Restore failed for " + app.appName() + ": " + userMessage(exception), exception);
        }
        String restartFailure = null;
        try {
            logs.add("Starting " + app.appName() + ".");
            AppActionResult start = startAndCheck(app, logs);
            logs.add(start.message());
        } catch (RuntimeException exception) {
            restartFailure = "Autark-OS could not start " + app.appName() + ": " + userMessage(exception);
            logs.add(restartFailure);
        }
        if (restartFailure != null && safetyArchive != null) {
            try {
                logs.add("Restoring the verified safety checkpoint for " + app.appName() + ".");
                backupArchiveService.restoreAppData(safetyArchive, "app", app.appId());
                AppActionResult recovered = startAndCheck(app, logs);
                logs.add(recovered.message());
            } catch (RuntimeException | IOException recoveryException) {
                String message = restartFailure + " Autark-OS also could not restore the safety checkpoint: " + userMessage(recoveryException);
                installedAppRepository.recordEvent(app.appId(), "restore_recovery_failed", message);
                activityLogService.error("backup", "restore_recovery_failed", "Restore recovery needs attention for " + app.appName(), message, app.appId(), recoveryException);
                throw new InstallationException(message, recoveryException);
            }
            String message = "Autark-OS could not start " + app.appName() + " after the requested restore. Its verified pre-restore data was restored and the app was started again; the requested restore was rolled back.";
            installedAppRepository.recordEvent(app.appId(), "restore_rolled_back", message);
            activityLogService.warning("backup", "restore_rolled_back", "Restore rolled back for " + app.appName(), message, app.appId());
            throw new InstallationException(message);
        }
        if (restoreFailure != null) {
            throw restoreFailure;
        }
        return new RestoreAppResult(app.appId(), app.appName(), restartFailure);
    }

    private AppActionResult startAndCheck(InstalledApp app, List<String> logs) {
        AppActionResult result = appLifecycleService.start(app.appId());
        AppHealthSnapshot health = appLifecycleService.healthSnapshot(app.appId());
        logs.add("Post-restore health: " + health.status() + " - " + health.message());
        if (AutarkOsStates.AppStatus.UNAVAILABLE.equals(health.status())
                || AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(health.status())) {
            throw new InstallationException("Post-restore health check failed for " + app.appName() + ": " + health.message());
        }
        return result;
    }

    private String restoreRestartWarningMessage(List<InstalledApp> apps, List<RestoreAppResult> restartFailures) {
        if (apps.size() == 1) {
            return "Data was restored for " + apps.getFirst().appName() + ", but Autark-OS could not restart it.";
        }
        String failedApps = restartFailures.stream()
                .map(RestoreAppResult::appName)
                .collect(java.util.stream.Collectors.joining(", "));
        return "Data was restored for " + apps.size() + " app(s), but Autark-OS could not restart "
                + restartFailures.size() + " app(s): " + failedApps + ".";
    }

    private String userMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Backup failed."
                : exception.getMessage();
    }

    private record RestoreAppResult(String appId, String appName, String restartFailure) {
    }
}
