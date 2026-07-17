package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

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
    private final AtomicBoolean automaticBackupRunning = new AtomicBoolean(false);

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
        this(runtimeLayout, installedAppRepository, backupRepository, activityLogService, settingsRepository, projectSettingsService, appLifecycleService, catalogService, appInstanceViewProvider, fileOperations, fileOpsService, new BackupDestinationService(runtimeLayout, settingsRepository, fileOpsService));
    }

    @Autowired
    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, AppInstanceViewProvider appInstanceViewProvider, RuntimeFileOperations fileOperations, AutarkOsFileOpsService fileOpsService, BackupDestinationService backupDestinationService) {
        this.runtimeLayout = runtimeLayout;
        this.installedAppRepository = installedAppRepository;
        this.backupRepository = backupRepository;
        this.activityLogService = activityLogService;
        this.settingsRepository = settingsRepository;
        this.projectSettingsService = projectSettingsService;
        this.appInstanceViewProvider = appInstanceViewProvider;
        this.backupDestinationService = backupDestinationService;
        BackupContractService backupContractService = new BackupContractService(catalogService);
        this.backupVerificationService = new BackupVerificationService(backupRepository, installedAppRepository, backupContractService, activityLogService);
        this.backupReportService = new BackupReportService(installedAppRepository, backupRepository, projectSettingsService, catalogService, fileOperations, backupContractService, this::backupRoot, backupDestinationService);
        this.backupArchiveService = new BackupArchiveService(fileOperations, fileOpsService, this::backupRoot, backupDestinationService::approvedRootForArchive);
        RestoreSimulationService restoreSimulationService = new RestoreSimulationService(backupContractService, this::backupRoot);
        this.restorePlanner = new RestorePlanner(backupRepository, backupContractService, backupVerificationService, restoreSimulationService, this::managedInstalledApps, backupDestinationService::archiveAvailable);
        this.restoreExecutor = new RestoreExecutor(backupRepository, installedAppRepository, activityLogService, appLifecycleService, fileOperations, backupArchiveService, restorePlanner, this::backupRoot);
    }

    public BackupModels.BackupReport report() {
        return backupReportService.report(managedInstalledApps());
    }

    public BackupModels.BackupDestination destination() {
        return backupDestinationService.current();
    }

    public BackupModels.BackupDestination previewDestination(String path) {
        return backupDestinationService.preview(path);
    }

    public BackupModels.BackupDestination configureDestination(String path) {
        return backupDestinationService.configure(path);
    }

    public BackupModels.BackupRunResult run(String appId) {
        return runAppBackup(appId, "manual");
    }

    public BackupModels.BackupRunResult runAutomatic() {
        ProjectSettings settings = projectSettingsService.current();
        if (!settings.automaticBackupsEnabled()) {
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", "automatic", "", "", AutarkOsStates.RestorePointStatus.FAILED, 0, "Automatic backups are turned off.");
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        return runFullBackup("automatic");
    }

    public Optional<BackupModels.BackupRunResult> runAutomaticIfDue() {
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
        if (!automaticBackupRunning.compareAndSet(false, true)) {
            return Optional.empty();
        }
        try {
            activityLogService.info("backup", "scheduled_backup_due", "Routine backup started", "Autark-OS started the scheduled routine backup window.");
            return Optional.of(runAutomatic());
        } finally {
            automaticBackupRunning.set(false);
        }
    }

    public BackupModels.BackupRunResult runFullBackup(String source) {
        BackupModels.BackupDestination destinationState = backupDestinationService.current();
        if (!destinationState.ready()) {
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), "", "", AutarkOsStates.RestorePointStatus.FAILED, 0, destinationState.message());
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        List<InstalledApp> apps = managedInstalledApps();
        List<InstalledApp> protectedApps = apps.stream()
                .filter(app -> installedAppRepository.settingsFor(app.appId()).map(InstallModels.InstallSettings::backup).orElse(InstallModels.BackupPolicy.defaults()).enabled())
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
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), "", "", AutarkOsStates.RestorePointStatus.FAILED, 0, "No apps are currently eligible for backup.");
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        try {
            Files.createDirectories(backupRoot().resolve("full"));
            Path destination = backupRoot().resolve("full").resolve("autark-os-full-" + BACKUP_NAME_FORMAT.format(Instant.now()) + ".zip");
            backupArchiveService.validateFullBackup(protectedApps);
            long size = backupArchiveService.createFullArchive(protectedApps, destination);
            String included = protectedApps.stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.joining(","));
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), included, destination.toString(), AutarkOsStates.RestorePointStatus.COMPLETED, size, "Full backup completed for " + protectedApps.size() + " app(s).");
            point = backupVerificationService.verifyRestorePoint(point).restorePoint();
            activityLogService.success("backup", cleanSource(source) + "_full_backup", "Full backup completed", point.message(), null);
            protectedApps.forEach(app -> installedAppRepository.recordEvent(app.appId(), "backup_completed", "Included in full " + cleanSource(source) + " backup."));
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.COMPLETED, point.message(), point, Instant.now());
        } catch (RuntimeException | IOException exception) {
            RestorePoint point = recordRestorePoint("__full__", "All apps", "full", cleanSource(source), protectedApps.stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.joining(",")), "", AutarkOsStates.RestorePointStatus.FAILED, 0, userMessage(exception));
            activityLogService.error("backup", cleanSource(source) + "_full_backup", "Full backup failed", userMessage(exception), null, exception);
            return new BackupModels.BackupRunResult("__full__", "All apps", AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
    }

    public RestoreModels.RestorePlan restorePlan(long restorePointId, String targetAppId) {
        return restorePlanner.restorePlan(restorePointId, targetAppId);
    }

    public BackupModels.BackupVerificationResult verify(long restorePointId) {
        return backupVerificationService.verifyRestorePoint(findRestorePoint(restorePointId)).result();
    }

    public RestoreModels.RestoreResult restore(long restorePointId, String targetAppId) {
        return restoreExecutor.restore(restorePointId, targetAppId);
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
        BackupModels.BackupDestination destinationState = backupDestinationService.current();
        if (!destinationState.ready()) {
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), "", AutarkOsStates.RestorePointStatus.FAILED, 0, destinationState.message());
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, point.message(), point, Instant.now());
        }
        try {
            backupArchiveService.validateAppBackup(source);
            Files.createDirectories(backupRoot().resolve(app.appId()));
            Path destination = backupRoot().resolve(app.appId()).resolve(app.appId() + "-" + BACKUP_NAME_FORMAT.format(Instant.now()) + ".zip");
            long size = backupArchiveService.createAppArchive(app.appId(), destination);
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), destination.toString(), AutarkOsStates.RestorePointStatus.COMPLETED, size, "Backup completed.");
            point = backupVerificationService.verifyRestorePoint(point).restorePoint();
            activityLogService.success("backup", cleanSource(backupSource) + "_app_backup", "Backup completed", app.appName() + " backup is ready.", app.appId());
            installedAppRepository.recordEvent(app.appId(), "backup_completed", "Backup completed.");
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.COMPLETED, "Backup completed.", point, Instant.now());
        } catch (RuntimeException | IOException exception) {
            RestorePoint point = recordRestorePoint(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), "", AutarkOsStates.RestorePointStatus.FAILED, 0, userMessage(exception));
            activityLogService.error("backup", cleanSource(backupSource) + "_app_backup", "Backup failed", userMessage(exception), app.appId(), exception);
            installedAppRepository.recordEvent(app.appId(), "backup_failed", userMessage(exception));
            return new BackupModels.BackupRunResult(app.appId(), app.appName(), AutarkOsStates.RestorePointStatus.FAILED, userMessage(exception), point, Instant.now());
        }
    }

    private RestorePoint recordRestorePoint(String appId, String appName, String path, String status, long sizeBytes, String message) {
        return recordRestorePoint(appId, appName, "app", "manual", appId, path, status, sizeBytes, message);
    }

    private RestorePoint recordRestorePoint(String appId, String appName, String scope, String source, String includedAppIds, String path, String status, long sizeBytes, String message) {
        RestorePointEntity saved = backupRepository.save(RestorePoints.create(appId, appName, scope, source, includedAppIds, path, status, sizeBytes, message));
        return RestorePoints.toDomain(saved);
    }

    private RestorePoint findRestorePoint(long restorePointId) {
        return backupRepository.findById(restorePointId)
                .map(RestorePoints::toDomain)
                .orElseThrow(() -> new InstallationException("Restore point was not found."));
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
            case "automatic", "pre_restore" -> normalized;
            default -> "manual";
        };
    }
}
