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
    private final RestorePlanner restorePlanner;
    private final Supplier<Path> backupRoot;

    RestoreExecutor(
            BackupRepository backupRepository,
            InstalledAppRepository installedAppRepository,
            ActivityLogService activityLogService,
            AppLifecycleService appLifecycleService,
            RuntimeFileOperations fileOperations,
            BackupArchiveService backupArchiveService,
            RestorePlanner restorePlanner,
            Supplier<Path> backupRoot) {
        this.backupRepository = backupRepository;
        this.installedAppRepository = installedAppRepository;
        this.activityLogService = activityLogService;
        this.appLifecycleService = appLifecycleService;
        this.fileOperations = fileOperations;
        this.backupArchiveService = backupArchiveService;
        this.restorePlanner = restorePlanner;
        this.backupRoot = backupRoot;
    }

    RestoreResult restore(long restorePointId, String targetAppId) {
        RestorePlan plan = restorePlanner.restorePlan(restorePointId, targetAppId);
        if (!plan.executable()) {
            throw new InstallationException("This restore point cannot be restored. Review the restore plan for details.");
        }
        RestorePoint point = backupRepository.findById(restorePointId);
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
            return new RestoreResult(point.id(), AutarkOsStates.RestorePointStatus.WARNING, message, apps.stream().map(InstalledApp::appId).toList(), logs, Instant.now());
        }
        String message = plan.scope().equals("full")
                ? "Full restore completed for " + apps.size() + " app(s)."
                : "Restore completed for " + apps.getFirst().appName() + ".";
        activityLogService.success("backup", "restore_completed", message, String.join(", ", apps.stream().map(InstalledApp::appName).toList()), null);
        return new RestoreResult(point.id(), AutarkOsStates.RestorePointStatus.COMPLETED, message, apps.stream().map(InstalledApp::appId).toList(), logs, Instant.now());
    }

    private RestoreAppResult restoreApp(RestorePoint point, InstalledApp app, List<String> logs) {
        Path destination = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        try {
            logs.add("Stopping " + app.appName() + ".");
            AppActionResult stop = appLifecycleService.stop(app.appId());
            logs.add(stop.message());
        } catch (RuntimeException exception) {
            logs.add("Autark-OS could not stop " + app.appName() + ": " + userMessage(exception));
        }
        try {
            if (Files.exists(destination) && fileOperations.directorySize(destination) > 0) {
                Files.createDirectories(backupRoot.get().resolve("pre-restore"));
                Path safety = backupRoot.get().resolve("pre-restore").resolve(app.appId() + "-pre-restore-" + BACKUP_NAME_FORMAT.format(Instant.now()) + ".zip");
                long size = backupArchiveService.createSafetyArchive(app.appId(), safety);
                backupRepository.record(app.appId(), app.appName(), "app", "pre_restore", app.appId(), safety.toString(), AutarkOsStates.RestorePointStatus.COMPLETED, size, "Safety backup created before restore.");
                logs.add("Created safety backup for " + app.appName() + ".");
            }
            backupArchiveService.restoreAppData(Path.of(point.path()), point.scope(), app.appId());
            installedAppRepository.recordEvent(app.appId(), "restore_completed", "Restored data from restore point #" + point.id() + ".");
            activityLogService.success("backup", "restore_app", "Restored " + app.appName(), "Restored data from restore point #" + point.id() + ".", app.appId());
            logs.add("Restored " + app.appName() + ".");
        } catch (RuntimeException | IOException exception) {
            installedAppRepository.recordEvent(app.appId(), "restore_failed", userMessage(exception));
            activityLogService.error("backup", "restore_app", "Restore failed for " + app.appName(), userMessage(exception), app.appId(), exception);
            throw new InstallationException("Restore failed for " + app.appName() + ": " + userMessage(exception), exception);
        } finally {
            try {
                logs.add("Starting " + app.appName() + ".");
                AppActionResult start = appLifecycleService.start(app.appId());
                logs.add(start.message());
            } catch (RuntimeException exception) {
                String message = "Autark-OS could not start " + app.appName() + ": " + userMessage(exception);
                logs.add(message);
                return new RestoreAppResult(app.appId(), app.appName(), message);
            }
        }
        return new RestoreAppResult(app.appId(), app.appName(), null);
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
