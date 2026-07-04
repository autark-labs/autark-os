package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.backups.BackupModels;
import com.autarkos.backups.BackupService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.models.ReliabilityModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.install.models.UpdateModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.system.ProjectSettingsService;

@Service
public class AppUpdateService {

    private final InstalledAppRepository repository;
    private final MarketplaceCatalogService catalogService;
    private final ComposeRenderer composeRenderer;
    private final DockerComposeExecutor composeExecutor;
    private final BackupService backupService;
    private final AppLifecycleService appLifecycleService;
    private final ActivityLogService activityLogService;
    private final ProjectSettingsService projectSettingsService;
    private final AppInstanceViewProvider appInstanceViewProvider;

    public AppUpdateService(InstalledAppRepository repository, MarketplaceCatalogService catalogService, ComposeRenderer composeRenderer, DockerComposeExecutor composeExecutor, BackupService backupService, AppLifecycleService appLifecycleService, ActivityLogService activityLogService, ProjectSettingsService projectSettingsService) {
        this(repository, catalogService, composeRenderer, composeExecutor, backupService, appLifecycleService, activityLogService, projectSettingsService, () -> repository.findAllApps().stream()
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
                .toList());
    }

    @Autowired
    public AppUpdateService(InstalledAppRepository repository, MarketplaceCatalogService catalogService, ComposeRenderer composeRenderer, DockerComposeExecutor composeExecutor, BackupService backupService, AppLifecycleService appLifecycleService, ActivityLogService activityLogService, ProjectSettingsService projectSettingsService, AppInstanceViewProvider appInstanceViewProvider) {
        this.repository = repository;
        this.catalogService = catalogService;
        this.composeRenderer = composeRenderer;
        this.composeExecutor = composeExecutor;
        this.backupService = backupService;
        this.appLifecycleService = appLifecycleService;
        this.activityLogService = activityLogService;
        this.projectSettingsService = projectSettingsService;
        this.appInstanceViewProvider = appInstanceViewProvider;
    }

    public List<UpdateModels.AppUpdateStatus> statuses() {
        return managedInstalledApps().stream().map(this::status).toList();
    }

    public UpdateModels.AppUpdatePlan plan(String appId) {
        InstalledApp app = installedApp(appId);
        UpdateModels.AppUpdateStatus status = status(app);
        List<String> warnings = new ArrayList<>();
        if (!status.updateAvailable()) {
            warnings.add("The installed app already matches the trusted catalog version.");
        }
        if (!"low".equals(status.risk())) {
            warnings.add("This update may need a closer review because the app uses multiple containers or database-backed storage.");
        }
        return new UpdateModels.AppUpdatePlan(
                app.appId(),
                app.appName(),
                status.currentImage(),
                status.targetImage(),
                status.risk(),
                status.updateAvailable(),
                status.updateChannel(),
                status.releaseNotesUrl(),
                status.sourceUrl(),
                status.registryStrategy(),
                status.backupCheckpointStatus(),
                status.rollbackSupport(),
                List.of(
                        "Create a verified backup checkpoint",
                        "Save the current Compose file for rollback",
                        "Render the trusted catalog version",
                        "Pull and recreate the app containers",
                        "Run health checks",
                        "Restore the previous version if health checks fail"),
                warnings,
                status.updateAvailable(),
                Instant.now());
    }

    public UpdateModels.AppUpdateResult update(String appId) {
        InstalledApp app = installedApp(appId);
        UpdateModels.AppUpdatePlan plan = plan(appId);
        if (!plan.executable()) {
            return new UpdateModels.AppUpdateResult(app.appId(), app.appName(), "skipped", "No trusted catalog update is available.", List.of(), appLifecycleService.getApp(appId), Instant.now());
        }
        List<String> logs = new ArrayList<>();
        Path appRoot = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        Path compose = appRoot.resolve("compose.yaml");
        Path previousCompose = appRoot.resolve("compose.previous.yaml");
        repository.recordEvent(appId, "update_planned", "Autark-OS planned an update to trusted catalog version " + plan.targetImage() + ".");
        activityLogService.info("applications", "update_planned", "Update planned for " + app.appName(), "Trusted target: " + plan.targetImage(), appId);
        repository.recordEvent(appId, "update_backup_started", "Creating a backup checkpoint before update.");
        activityLogService.info("applications", "update_backup_started", "Backup checkpoint started for " + app.appName(), "Autark-OS creates a restore point before updating.", appId);
        BackupModels.BackupRunResult checkpoint = backupService.run(appId);
        logs.add("Backup checkpoint: " + checkpoint.message());
        if (AutarkOsStates.RestorePointStatus.COMPLETED.equals(checkpoint.status())) {
            repository.recordEvent(appId, "update_backup_completed", "Backup checkpoint completed before update.");
            activityLogService.success("applications", "update_backup_completed", "Backup checkpoint completed for " + app.appName(), checkpoint.message(), appId);
        } else {
            repository.recordEvent(appId, "update_backup_failed", "Backup checkpoint failed before update: " + checkpoint.message());
            activityLogService.warning("applications", "update_backup_failed", "Backup checkpoint failed for " + app.appName(), checkpoint.message(), appId);
            logs.add("Update stopped because Autark-OS could not create a backup checkpoint.");
            return new UpdateModels.AppUpdateResult(app.appId(), app.appName(), AutarkOsStates.JobStatus.FAILED, "Update was not started because Autark-OS could not create a backup checkpoint.", logs, appLifecycleService.getApp(appId), Instant.now());
        }
        try {
            Files.copy(compose, previousCompose, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            ApplicationManifest manifest = manifest(appId);
            composeRenderer.render(manifest, appRoot);
            repository.recordEvent(appId, "update_started", "Applying trusted catalog version " + manifest.runtime().image() + ".");
            activityLogService.info("applications", "update_started", "Update started for " + app.appName(), "Applying " + manifest.runtime().image(), appId);
            RuntimeModels.DockerComposeResult result = composeExecutor.up(compose, app.composeProject());
            logs.addAll(result.output());
            if (!result.successful()) {
                throw new InstallationException("Docker Compose could not apply the update.");
            }
            AppHealthSnapshot health = appLifecycleService.healthSnapshot(appId);
            logs.add("Health after update: " + health.status() + " - " + health.message());
            if (AutarkOsStates.AppStatus.UNAVAILABLE.equals(health.status()) || AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(health.status())) {
                repository.recordEvent(appId, "update_health_failed", "Health check failed after update: " + health.message());
                activityLogService.warning("applications", "update_health_failed", "Update health check failed for " + app.appName(), health.message(), appId);
                throw new InstallationException("Health check failed after update: " + health.message());
            }
            repository.recordEvent(appId, "update_completed", "Updated " + app.appName() + " to the trusted catalog version.");
            activityLogService.success("applications", "update_completed", "Updated " + app.appName(), "Autark-OS updated the app and health checks passed.", appId);
            return new UpdateModels.AppUpdateResult(app.appId(), app.appName(), "completed", "Update completed and health checks passed.", logs, appLifecycleService.getApp(appId), Instant.now());
        } catch (RuntimeException | IOException exception) {
            logs.add("Update failed: " + userMessage(exception));
            rollback(app, checkpoint, previousCompose, compose, logs);
            repository.recordEvent(appId, "update_rolled_back", "Update failed and Autark-OS restored the previous version. Reason: " + userMessage(exception));
            activityLogService.warning("applications", "update_rolled_back", "Rolled back " + app.appName(), userMessage(exception), appId);
            return new UpdateModels.AppUpdateResult(app.appId(), app.appName(), "rolled_back", "Update failed, so Autark-OS restored the previous version.", logs, appLifecycleService.getApp(appId), Instant.now());
        }
    }

    public UpdateModels.AppUpdateResult rollback(String appId) {
        InstalledApp app = installedApp(appId);
        List<String> logs = new ArrayList<>();
        Path appRoot = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        rollback(app, null, appRoot.resolve("compose.previous.yaml"), appRoot.resolve("compose.yaml"), logs);
        return new UpdateModels.AppUpdateResult(app.appId(), app.appName(), "rolled_back", "Rollback command completed.", logs, appLifecycleService.getApp(appId), Instant.now());
    }

    private void rollback(InstalledApp app, BackupModels.BackupRunResult checkpoint, Path previousCompose, Path compose, List<String> logs) {
        try {
            repository.recordEvent(app.appId(), "rollback_started", "Autark-OS started rollback for " + app.appName() + ".");
            if (Files.isRegularFile(previousCompose)) {
                Files.copy(previousCompose, compose, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                logs.add("Restored previous Compose file.");
            }
            if (checkpoint != null && checkpoint.restorePoint() != null && "completed".equals(checkpoint.status())) {
                backupService.restore(checkpoint.restorePoint().id(), app.appId());
                logs.add("Restored data checkpoint.");
            }
            RuntimeModels.DockerComposeResult rollback = composeExecutor.up(compose, app.composeProject());
            logs.addAll(rollback.output());
            repository.recordEvent(app.appId(), "rollback_completed", "Rollback completed for " + app.appName() + ".");
            activityLogService.success("applications", "rollback_completed", "Rollback completed for " + app.appName(), "Previous Compose/data checkpoint was restored where available.", app.appId());
        } catch (RuntimeException | IOException rollbackError) {
            logs.add("Rollback needs manual review: " + userMessage(rollbackError));
            repository.recordEvent(app.appId(), "rollback_failed", "Rollback needs manual review: " + userMessage(rollbackError));
            activityLogService.error("applications", "rollback_failed", "Rollback failed for " + app.appName(), userMessage(rollbackError), app.appId(), rollbackError);
        }
    }

    private UpdateModels.AppUpdateStatus status(InstalledApp app) {
        ApplicationManifest manifest = manifest(app.appId());
        String currentImage = currentImage(app).orElse(manifest.runtime().image());
        String targetImage = manifest.runtime().image();
        boolean updateAvailable = !currentImage.equals(targetImage);
        boolean rollbackAvailable = Files.isRegularFile(Path.of(app.runtimePath()).resolve("compose.previous.yaml"));
        return new UpdateModels.AppUpdateStatus(
                app.appId(),
                app.appName(),
                currentImage,
                targetImage,
                tag(currentImage),
                manifest.version(),
                updateAvailable,
                projectSettingsService.current().updateChannel(),
                releaseNotesUrl(manifest),
                manifest.sourceUrl(),
                "Registry checks are advisory in this build. Autark-OS only installs trusted catalog versions.",
                "trusted-catalog-only",
                manifest.runtime().multiService() ? "medium" : "low",
                true,
                "verified-backup-before-update",
                rollbackAvailable,
                rollbackAvailable ? "Previous Compose file is available for rollback." : "Rollback becomes available after Autark-OS saves a previous Compose file.",
                Instant.now());
    }

    private Optional<String> currentImage(InstalledApp app) {
        Path compose = Path.of(app.runtimePath()).resolve("compose.yaml");
        if (!Files.isRegularFile(compose)) {
            return Optional.empty();
        }
        try {
            return Files.readAllLines(compose).stream()
                    .map(String::trim)
                    .filter(line -> line.startsWith("image:"))
                    .map(line -> line.substring("image:".length()).trim())
                    .findFirst();
        } catch (IOException exception) {
            return Optional.empty();
        }
    }

    private String tag(String image) {
        int index = image == null ? -1 : image.lastIndexOf(':');
        return index < 0 ? "latest" : image.substring(index + 1);
    }

    private ApplicationManifest manifest(String appId) {
        return catalogService.findById(appId).orElseThrow(() -> new InstallationException("The trusted catalog no longer contains " + appId + "."));
    }

    private String releaseNotesUrl(ApplicationManifest manifest) {
        if (manifest.documentationUrl() != null && !manifest.documentationUrl().isBlank()) {
            return manifest.documentationUrl();
        }
        return manifest.sourceUrl();
    }

    private InstalledApp installedApp(String appId) {
        if (!managedAppIds().contains(appId)) {
            throw new InstallationException("Autark-OS is not managing an app with id " + appId + ".");
        }
        return repository.findAppById(appId).orElseThrow(() -> new InstallationException("Autark-OS is not managing an app with id " + appId + "."));
    }

    private List<InstalledApp> managedInstalledApps() {
        java.util.Set<String> managedAppIds = managedAppIds();
        return repository.findAllApps().stream()
                .filter(app -> managedAppIds.contains(app.appId()))
                .toList();
    }

    private java.util.Set<String> managedAppIds() {
        return appInstanceViewProvider.list().stream()
                .map(AppInstanceView::catalogAppId)
                .filter(id -> id != null && !id.isBlank())
                .collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new));
    }

    private String userMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank() ? "Update failed." : exception.getMessage();
    }
}
