package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.AppActionResult;
import com.autarkos.marketplace.install.AppHealthSnapshot;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;

class RestoreExecutor {

    private final BackupRepository backupRepository;
    private final InstalledAppRepository installedAppRepository;
    private final ActivityLogService activityLogService;
    private final AppLifecycleService appLifecycleService;
    private final BackupArchiveService backupArchiveService;
    private final BackupVerificationService backupVerificationService;
    private final RestorePlanner restorePlanner;
    private final ManagedAppAttestationService managedApps;
    private final BackupJobs progress;

    RestoreExecutor(
            BackupRepository backupRepository,
            InstalledAppRepository installedAppRepository,
            ActivityLogService activityLogService,
            AppLifecycleService appLifecycleService,
            BackupArchiveService backupArchiveService,
            BackupVerificationService backupVerificationService,
            RestorePlanner restorePlanner,
            ManagedAppAttestationService managedApps, BackupJobs progress) {
        this.progress = progress;
        this.backupRepository = backupRepository;
        this.installedAppRepository = installedAppRepository;
        this.activityLogService = activityLogService;
        this.appLifecycleService = appLifecycleService;
        this.backupArchiveService = backupArchiveService;
        this.backupVerificationService = backupVerificationService;
        this.restorePlanner = restorePlanner;
        this.managedApps = managedApps;
    }

    RestoreModels.RestoreResult restore(long restorePointId, String targetAppId, String planId) {
        progress.start("validate_restore_point", "Validating restore point");
        RestoreModels.RestorePlan plan = restorePlanner.requireReviewed(restorePointId, targetAppId, planId);
        if (!plan.executable()) {
            throw new InstallationException("This restore point cannot be restored. Review the restore plan for details.");
        }
        RestorePoint point = backupRepository.findById(restorePointId)
                .map(RestorePoints::toDomain)
                .orElseThrow(() -> new InstallationException("Restore point was not found."));
        List<InstalledApp> apps = restorePlanner.affectedApps(point, targetAppId);
        progress.complete("validate_restore_point", "Restore point and affected apps validated.");
        List<String> logs = new ArrayList<>();
        List<String> restored = new ArrayList<>();
        for (int index = 0; index < apps.size(); index++) {
            InstalledApp app = apps.get(index);
            try {
                restoreApp(point, app, logs);
                restored.add(app.appId());
            } catch (RuntimeException failure) {
                progress.fail(userMessage(failure));
                if (!"full".equals(plan.scope())) throw failure;
                var remaining = apps.subList(index + 1, apps.size());
                String restoredNames = apps.subList(0, index).stream().map(InstalledApp::appName).collect(java.util.stream.Collectors.joining(", "));
                String unattemptedNames = remaining.stream().map(InstalledApp::appName).collect(java.util.stream.Collectors.joining(", "));
                String message = "Restore from archive #" + point.id() + " stopped. Restored: " + (restoredNames.isEmpty() ? "none" : restoredNames)
                        + ". Failed: " + app.appName() + ". Not attempted: " + (unattemptedNames.isEmpty() ? "none" : unattemptedNames)
                        + ". Earlier successful restores were kept. " + userMessage(failure);
                activityLogService.error("backup", "restore_partial_failure", "Restore stopped", message, app.appId(), failure);
                return new RestoreModels.RestoreResult(point.id(), "failed", message, List.copyOf(restored), List.of(app.appId()),
                        remaining.stream().map(InstalledApp::appId).toList(), logs, Instant.now());
            }
        }
        String message = plan.scope().equals("full")
                ? "Full restore completed for " + apps.size() + " app(s)."
                : "Restore completed for " + apps.getFirst().appName() + ".";
        progress.start("finish", "Recording restore result");
        activityLogService.success("backup", "restore_completed", message, String.join(", ", apps.stream().map(InstalledApp::appName).toList()), null);
        progress.complete("finish", "Restore history saved.");
        return new RestoreModels.RestoreResult(point.id(), AutarkOsStates.RestorePointStatus.COMPLETED, message, List.copyOf(restored), List.of(), List.of(), logs, Instant.now());
    }

    private void restoreApp(RestorePoint point, InstalledApp app, List<String> logs) {
        progress.start("prepare_app:" + app.appId(), "Checking " + app.appName() + " storage and ownership");
        var protectedPaths = managedApps.durableStorage(app, true).protectedPaths();
        var checkpoint = appLifecycleService.prepareCheckpoint(app.appId());
        progress.complete("prepare_app:" + app.appId(), "Managed storage and ownership confirmed.");
        RestorePoint safetyPoint = null;
        boolean dataChanging = false;
        try {
            logs.add("Stopping " + app.appName() + " before the safety checkpoint.");
            progress.start("stop_apps:" + app.appId(), "Pausing " + app.appName());
            appLifecycleService.stopForCheckpoint(checkpoint);
            progress.complete("stop_apps:" + app.appId(), "App is stopped.");
            progress.start("create_safety_backup:" + app.appId(), "Creating and verifying safety backup for " + app.appName());
            safetyPoint = backupArchiveService.createCheckpoint(app, protectedPaths, "pre_restore");
            logs.add("Created and verified safety checkpoint #" + safetyPoint.id() + ".");
            progress.complete("create_safety_backup:" + app.appId(), "Safety checkpoint created and verified.");
            progress.start("verify_source:" + app.appId(), "Checking restore source integrity");
            var integrity = backupVerificationService.restoreIntegrity(point);
            if (!integrity.restorable()) {
                throw new InstallationException("Restore point integrity changed before Autark-OS could apply it: " + integrity.message());
            }
            progress.complete("verify_source:" + app.appId(), "Restore source integrity confirmed.");
            progress.start("restore_data:" + app.appId(), "Restoring " + app.appName() + " data");
            appLifecycleService.confirmCheckpointStopped(app);
            appLifecycleService.checkpointDataChanging(checkpoint);
            dataChanging = true;
            backupArchiveService.restoreAppData(Path.of(point.path()), point.scope(), app.appId());
            appLifecycleService.checkpointDataReady(checkpoint);
            progress.complete("restore_data:" + app.appId(), "App data restored.");
            progress.start("start_apps:" + app.appId(), "Starting and checking " + app.appName());
            logs.add(startAndCheck(app, logs).message());
            progress.complete("start_apps:" + app.appId(), "App is running and its health was checked.");
        } catch (RuntimeException | IOException failure) {
            progress.fail(userMessage(failure));
            String message = "Restore failed for " + app.appName() + ": " + userMessage(failure);
            if (dataChanging && safetyPoint != null) {
                try {
                    // A failed write may already have replaced some files. Never start those files.
                    progress.start("rollback:" + app.appId(), "Restoring verified safety checkpoint for " + app.appName());
                    appLifecycleService.checkpointDataChanging(checkpoint);
                    appLifecycleService.stopAndConfirm(app.appId());
                    var safetyIntegrity = backupVerificationService.restoreIntegrity(safetyPoint);
                    if (!safetyIntegrity.restorable()) throw new InstallationException(safetyIntegrity.message());
                    backupArchiveService.restoreAppData(Path.of(safetyPoint.path()), "app", app.appId());
                    appLifecycleService.checkpointDataReady(checkpoint);
                    var recoveryFailure = appLifecycleService.resumeAfterCheckpoint(checkpoint);
                    message += " The verified pre-restore data was restored; the requested restore was rolled back."
                            + recoveryFailure.map(reason -> " " + reason).orElse("");
                    progress.complete("rollback:" + app.appId(), message);
                    installedAppRepository.recordEvent(app.appId(), "restore_rolled_back", message);
                } catch (RuntimeException | IOException recoveryFailure) {
                    progress.fail(userMessage(recoveryFailure));
                    message += " Autark-OS also could not restore the safety checkpoint. Keep the app stopped and review checkpoint #"
                            + safetyPoint.id() + " in Backups before starting it.";
                    appLifecycleService.failCheckpoint(checkpoint, false, message);
                    activityLogService.error("backup", "restore_recovery_failed", "Restore recovery needs attention for " + app.appName(), message, app.appId(), recoveryFailure);
                }
            } else {
                message += " No app data was changed.";
                message += appLifecycleService.resumeAfterCheckpoint(checkpoint).map(reason -> " " + reason).orElse("");
            }
            installedAppRepository.recordEvent(app.appId(), "restore_failed", message);
            activityLogService.error("backup", "restore_app", "Restore failed for " + app.appName(), message, app.appId(), failure);
            throw new InstallationException(message, failure);
        }
        // Bookkeeping failures must never roll back healthy restored data or discard new writes.
        progress.start("record_result:" + app.appId(), "Recording restore result for " + app.appName());
        appLifecycleService.completeCheckpoint(checkpoint, "Restored data is ready and the app is running.");
        installedAppRepository.recordEvent(app.appId(), "restore_completed", "Restored data from restore point #" + point.id() + ".");
        progress.complete("record_result:" + app.appId(), "Restore result saved.");
        logs.add("Restored " + app.appName() + ".");
    }

    private AppActionResult startAndCheck(InstalledApp app, List<String> logs) {
        AppActionResult result = appLifecycleService.start(app.appId());
        appLifecycleService.confirmCheckpointRunning(app);
        AppHealthSnapshot health = appLifecycleService.healthSnapshot(app.appId());
        logs.add("Post-restore health: " + health.status() + " - " + health.message());
        if (AutarkOsStates.AppStatus.UNAVAILABLE.equals(health.status())
                || AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(health.status())) {
            throw new InstallationException("Post-restore health check failed for " + app.appName() + ": " + health.message());
        }
        return result;
    }

    private String userMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Backup failed."
                : exception.getMessage();
    }

}
