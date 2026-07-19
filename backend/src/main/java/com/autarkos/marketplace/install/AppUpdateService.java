package com.autarkos.marketplace.install;

import java.io.IOException;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.backups.BackupModels;
import com.autarkos.backups.BackupService;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.install.models.UpdateModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.RuntimeManifest;
import com.autarkos.marketplace.model.RuntimeServiceManifest;

/**
 * Applies the deliberately narrow, reversible first generation of managed
 * updates. A release may change image versions only; any runtime-layout,
 * storage, port, environment, or service-topology change is blocked for
 * manual review instead of being guessed at.
 */
@Service
public class AppUpdateService {

    private static final Pattern IMAGE_LINE = Pattern.compile("^(\\s*image:\\s*).*$", Pattern.MULTILINE);
    private static final Pattern VERSION_PART = Pattern.compile("\\d+|[A-Za-z]+");

    private final InstalledAppRepository installedApps;
    private final MarketplaceCatalogService catalog;
    private final ManifestYamlReader manifestReader;
    private final AppRuntimeMetadataReader metadataReader;
    private final AppRuntimeMetadataWriter metadataWriter;
    private final CatalogPackageCopier catalogPackageCopier;
    private final DockerComposeExecutor composeExecutor;
    private final BackupService backupService;
    private final AppLifecycleService lifecycleService;
    private final AppUpdateSnapshotStore snapshots;
    private final ActivityLogService activityLog;

    /** Keeps old direct callers explicitly unsupported outside Spring. */
    public AppUpdateService() {
        this.installedApps = null;
        this.catalog = null;
        this.manifestReader = null;
        this.metadataReader = null;
        this.metadataWriter = null;
        this.catalogPackageCopier = null;
        this.composeExecutor = null;
        this.backupService = null;
        this.lifecycleService = null;
        this.snapshots = null;
        this.activityLog = null;
    }

    @Autowired
    public AppUpdateService(
            InstalledAppRepository installedApps,
            MarketplaceCatalogService catalog,
            ManifestYamlReader manifestReader,
            AppRuntimeMetadataReader metadataReader,
            AppRuntimeMetadataWriter metadataWriter,
            CatalogPackageCopier catalogPackageCopier,
            DockerComposeExecutor composeExecutor,
            BackupService backupService,
            AppLifecycleService lifecycleService,
            AppUpdateSnapshotStore snapshots,
            ActivityLogService activityLog) {
        this.installedApps = installedApps;
        this.catalog = catalog;
        this.manifestReader = manifestReader;
        this.metadataReader = metadataReader;
        this.metadataWriter = metadataWriter;
        this.catalogPackageCopier = catalogPackageCopier;
        this.composeExecutor = composeExecutor;
        this.backupService = backupService;
        this.lifecycleService = lifecycleService;
        this.snapshots = snapshots;
        this.activityLog = activityLog;
    }

    public UpdateModels.AppUpdateCapability capability() {
        return configured() ? UpdateModels.AppUpdateCapability.supported() : UpdateModels.AppUpdateCapability.unavailable();
    }

    public UpdateModels.AppUpdatePlan updatePlan(String appId) {
        if (!configured()) {
            return unavailablePlan(appId, "update");
        }
        try {
            UpdateContext context = updateContext(appId);
            Optional<AppUpdateSnapshot> activeSnapshot = snapshots.activeFor(appId);
            if (activeSnapshot.isPresent()) {
                AppUpdateSnapshot snapshot = activeSnapshot.get();
                return blocked(context.app(), "update", "Update needs recovery", "Autark-OS found an interrupted release change.",
                        List.of("Restore the saved " + snapshot.fromVersion() + " release before starting another update."));
            }
            if (context.versionComparison() == 0) {
                return new UpdateModels.AppUpdatePlan(
                        context.app().appId(), context.app().appName(), "update", "current", "App is up to date",
                        context.app().appName() + " is already on catalog release " + context.currentVersion() + ".",
                        context.currentVersion(), context.targetVersion(), false, true,
                        snapshots.latestRollbackFor(appId).isPresent(), snapshots.latestRollbackFor(appId).map(AppUpdateSnapshot::snapshotId).orElse(""),
                        List.of(), List.of(), Instant.now());
            }
            if (context.versionComparison() < 0) {
                return blocked(context.app(), "update", "Catalog release is older", "Autark-OS will not turn an update into a downgrade.",
                        List.of("The installed release is newer than the current catalog release."));
            }
            if (!healthyForUpdate(context.app())) {
                return blocked(context.app(), "update", "App needs attention first", "Autark-OS will not change a release while the current app is unhealthy.",
                        List.of("Repair or start the app and confirm it is healthy before updating."));
            }
            List<String> compatibilityReasons = compatibilityReasons(context);
            if (!immutableImagesAvailable(context.currentImages())) {
                compatibilityReasons.add("Autark-OS could not resolve immutable image digests for the currently running release.");
            }
            if (!compatibilityReasons.isEmpty()) {
                return blocked(context.app(), "update", "Update needs review", "This release changes more than container images.", compatibilityReasons);
            }
            if (!backupReady(context.app())) {
                return blocked(context.app(), "update", "Backup required", "Autark-OS needs a verified safety checkpoint before changing this app.",
                        List.of("Turn on backups and configure a ready backup destination before updating."));
            }
            Optional<AppUpdateSnapshot> rollback = snapshots.latestRollbackFor(appId);
            return new UpdateModels.AppUpdatePlan(
                    context.app().appId(), context.app().appName(), "update", "available", "Update ready to review",
                    "Autark-OS will create a verified backup, pin the target images by digest, and retain " + context.currentVersion() + " for rollback.",
                    context.currentVersion(), context.targetVersion(), true, true,
                    rollback.isPresent(), rollback.map(AppUpdateSnapshot::snapshotId).orElse(""),
                    List.of("Create verified safety checkpoint", "Pull release " + context.targetVersion() + " by immutable image digest", "Verify app health before completing"),
                    List.of(), Instant.now());
        } catch (InstallationException exception) {
            return UpdateModels.AppUpdatePlan.blocked(appId, "App", "update", "Update unavailable", exception.getMessage(), List.of(exception.getMessage()));
        }
    }

    public UpdateModels.AppUpdatePlan rollbackPlan(String appId) {
        if (!configured()) {
            return unavailablePlan(appId, "rollback");
        }
        InstalledApp app = installedApp(appId);
        Optional<AppUpdateSnapshot> rollback = snapshots.latestRollbackFor(appId);
        if (rollback.isEmpty()) {
            Optional<AppUpdateSnapshot> interrupted = snapshots.activeFor(appId);
            if (interrupted.isPresent()) {
                AppUpdateSnapshot snapshot = interrupted.get();
                return new UpdateModels.AppUpdatePlan(app.appId(), app.appName(), "rollback", "recovery_required", "Release recovery is ready",
                        "Autark-OS saved the previous release before an interrupted update.", "", snapshot.fromVersion(), true, true, true,
                        snapshot.snapshotId(), List.of("Create a fresh safety checkpoint", "Restore " + snapshot.fromVersion() + ""), List.of(), Instant.now());
            }
            return blocked(app, "rollback", "No rollback point", "Autark-OS has no verified previous release for this app.",
                    List.of("Complete one managed update before rolling back."));
        }
        AppUpdateSnapshot snapshot = rollback.get();
        if (!backupReady(app)) {
            return blocked(app, "rollback", "Backup required", "Autark-OS needs a fresh safety checkpoint before restoring a previous release.",
                    List.of("Turn on backups and configure a ready backup destination before rolling back."));
        }
        return new UpdateModels.AppUpdatePlan(app.appId(), app.appName(), "rollback", "available", "Rollback ready to review",
                "Autark-OS will create a fresh safety checkpoint, then restore " + snapshot.fromVersion() + " from its retained release snapshot.",
                snapshot.toVersion(), snapshot.fromVersion(), true, true, true, snapshot.snapshotId(),
                List.of("Create verified safety checkpoint", "Restore prior Compose, manifest, and metadata", "Verify app health"), List.of(), Instant.now());
    }

    public void update(String appId, Consumer<String> progress) {
        UpdateModels.AppUpdatePlan plan = updatePlan(appId);
        if (!plan.canApply()) {
            throw new InstallationException(firstReason(plan, "Autark-OS cannot safely update this app."));
        }
        UpdateContext context = updateContext(appId);
        backupService.runWithUpdateSafetyCheckpoint(appId, RecoveryOperationCoordinator.Operation.APP_UPDATE, backup -> {
            assertVerifiedSafetyCheckpoint(backup, context.app());
            applyUpdate(context, backup.restorePoint().id(), progress == null ? ignored -> { } : progress);
            return null;
        });
    }

    public void rollback(String appId, Consumer<String> progress) {
        UpdateModels.AppUpdatePlan plan = rollbackPlan(appId);
        if (!plan.canApply()) {
            throw new InstallationException(firstReason(plan, "Autark-OS cannot safely roll this app back."));
        }
        AppUpdateSnapshot previous = snapshots.activeFor(appId)
                .or(() -> snapshots.latestRollbackFor(appId))
                .orElseThrow(() -> new InstallationException("No saved release is available for rollback."));
        InstalledApp app = installedApp(appId);
        backupService.runWithUpdateSafetyCheckpoint(appId, RecoveryOperationCoordinator.Operation.APP_ROLLBACK, backup -> {
            assertVerifiedSafetyCheckpoint(backup, app);
            applyRollback(app, previous, backup.restorePoint().id(), progress == null ? ignored -> { } : progress);
            return null;
        });
    }

    private void applyUpdate(UpdateContext context, long safetyRestorePointId, Consumer<String> progress) {
        progress.accept("snapshot_release");
        String currentCompose = readCompose(context.app());
        String immutableCurrentCompose = withResolvedImages(currentCompose, context.currentImages(), "current release");
        AppUpdateSnapshot snapshot = snapshots.create(
                context.app(), "update", context.currentVersion(), context.targetVersion(), safetyRestorePointId, immutableCurrentCompose);
        activityLog.info("applications", "app_update_checkpoint", "Update checkpoint created for " + context.app().appName(),
                "Saved release " + context.currentVersion() + " before applying " + context.targetVersion() + ".", context.app().appId());
        installedApps.recordEvent(context.app().appId(), "update_checkpoint_created", "Saved release " + context.currentVersion() + " before update.");

        try {
            progress.accept("pull_release");
            Path stage = stageCompose(context.app(), replaceImages(currentCompose, context.targetImages()));
            RuntimeModels.DockerComposeResult pull = composeExecutor.pull(stage, context.app().composeProject());
            if (!pull.successful()) {
                throw new InstallationException("Autark-OS could not download the target app release.");
            }
            String immutableTargetCompose = withResolvedImages(read(stage), context.targetImages(), "target release");
            progress.accept("apply_release");
            writeCompose(context.app(), immutableTargetCompose);
            catalogPackageCopier.copyManifest(context.targetManifest(), Path.of(context.app().runtimePath()));
            metadataWriter.write(context.targetManifest(), Path.of(context.app().runtimePath()), context.metadata().appInstanceId(), context.app().composeProject());
            RuntimeModels.DockerComposeResult up = composeExecutor.up(composeFile(context.app()), context.app().composeProject());
            if (!up.successful()) {
                throw new InstallationException("Autark-OS could not start the target app release.");
            }
            progress.accept("verify_release");
            assertHealthy(context.app());
            snapshots.updateStatus(snapshot, "rollback_available", "Release " + context.currentVersion() + " is ready for rollback.");
            installedApps.recordEvent(context.app().appId(), "update_completed", "Updated from " + context.currentVersion() + " to " + context.targetVersion() + ".");
            activityLog.success("applications", "app_update_completed", "Updated " + context.app().appName(),
                    "Updated from " + context.currentVersion() + " to " + context.targetVersion() + ". The previous release is available for rollback.", context.app().appId());
        } catch (RuntimeException exception) {
            recoverPreviousRelease(context.app(), snapshot, exception);
            throw exception;
        } finally {
            deleteStage(context.app());
        }
    }

    private void applyRollback(InstalledApp app, AppUpdateSnapshot previous, long safetyRestorePointId, Consumer<String> progress) {
        progress.accept("snapshot_release");
        String currentVersion = currentVersion(app);
        AppUpdateSnapshot recovery = snapshots.create(
                app,
                "rollback",
                currentVersion,
                previous.fromVersion(),
                safetyRestorePointId,
                withResolvedImages(readCompose(app), imagesForRuntimeManifest(readRuntimeManifest(app)), "current release"));
        try {
            progress.accept("apply_release");
            snapshots.restore(previous, app);
            RuntimeModels.DockerComposeResult up = composeExecutor.up(composeFile(app), app.composeProject());
            if (!up.successful()) {
                throw new InstallationException("Autark-OS could not start the previous app release.");
            }
            progress.accept("verify_release");
            assertHealthy(app);
            snapshots.updateStatus(previous, "rolled_back", "Restored on " + Instant.now() + ".");
            snapshots.updateStatus(recovery, "rollback_available", "Release " + currentVersion + " is available if you need to reverse this rollback.");
            installedApps.recordEvent(app.appId(), "rollback_completed", "Restored release " + previous.fromVersion() + ".");
            activityLog.success("applications", "app_rollback_completed", "Restored " + app.appName(),
                    "Restored release " + previous.fromVersion() + " and retained the newer release for recovery.", app.appId());
        } catch (RuntimeException exception) {
            recoverPreviousRelease(app, recovery, exception);
            throw exception;
        }
    }

    private void recoverPreviousRelease(InstalledApp app, AppUpdateSnapshot snapshot, RuntimeException failure) {
        try {
            snapshots.restore(snapshot, app);
            RuntimeModels.DockerComposeResult recovered = composeExecutor.up(composeFile(app), app.composeProject());
            if (!recovered.successful()) {
                throw new InstallationException("Autark-OS could not restart the saved release.");
            }
            assertHealthy(app);
            snapshots.updateStatus(snapshot, "rolled_back", "Autark-OS restored this release after a failed change.");
            installedApps.recordEvent(app.appId(), "update_auto_rollback_completed", "Autark-OS restored the saved release after a failed update.");
            activityLog.warning("applications", "app_update_auto_rollback", "Update rolled back for " + app.appName(),
                    "The new release did not verify, so Autark-OS restored the saved release.", app.appId());
            throw new InstallationException("The release change failed, and Autark-OS restored the previous release.", failure);
        } catch (InstallationException recoveryFailure) {
            if (recoveryFailure.getCause() == failure) {
                throw recoveryFailure;
            }
            snapshots.updateStatus(snapshot, "recovery_required", "The release change failed and automatic recovery also failed.");
            installedApps.recordEvent(app.appId(), "update_recovery_required", "A release change needs manual recovery: " + safeMessage(recoveryFailure));
            activityLog.error("applications", "app_update_recovery_failed", "Release recovery needs attention for " + app.appName(),
                    "Autark-OS preserved the release checkpoint, but could not restart it automatically.", app.appId(), recoveryFailure);
            throw new InstallationException("The release change failed and needs recovery. Autark-OS kept the saved release checkpoint.", recoveryFailure);
        }
    }

    private UpdateContext updateContext(String appId) {
        InstalledApp app = installedApp(appId);
        assertOwned(app);
        ApplicationManifest current = readRuntimeManifest(app);
        RuntimeModels.AppRuntimeMetadata metadata = metadataReader.read(Path.of(app.runtimePath()))
                .orElseThrow(() -> new InstallationException("Autark-OS could not verify this app's release metadata."));
        if (metadata.appInstanceId() == null || metadata.appInstanceId().isBlank()
                || metadata.composeProject() == null || metadata.composeProject().isBlank()
                || !app.composeProject().equals(metadata.composeProject())
                || !app.appId().equals(metadata.catalogAppId())) {
            throw new InstallationException("Autark-OS could not verify that this runtime belongs to the current managed app release.");
        }
        ApplicationManifest target = catalog.findById(app.appId())
                .orElseThrow(() -> new InstallationException("This app is no longer available in the current catalog."));
        String currentVersion = version(metadata.manifestVersion(), current.version());
        String targetVersion = version(target.version(), "unknown");
        return new UpdateContext(
                app,
                current,
                target,
                metadata,
                currentVersion,
                targetVersion,
                compareVersions(targetVersion, currentVersion),
                imagesForRuntimeManifest(current),
                imagesForRuntimeManifest(target));
    }

    private List<String> compatibilityReasons(UpdateContext context) {
        List<String> reasons = new ArrayList<>();
        if (!sameRuntimeLayout(context.currentManifest().runtime(), context.targetManifest().runtime())) {
            reasons.add("This catalog release changes the app's runtime layout, ports, storage, environment, or service topology.");
        }
        if (context.currentImages().isEmpty() || context.targetImages().isEmpty()) {
            reasons.add("Autark-OS could not identify every container image for this release.");
        }
        if (countImageLines(readCompose(context.app())) != context.currentImages().size()) {
            reasons.add("The deployed Compose file does not match the saved app release, so Autark-OS cannot safely rewrite it.");
        }
        if (context.currentImages().size() != context.targetImages().size()) {
            reasons.add("This release adds or removes containers and needs a migration-specific update plan.");
        }
        return reasons;
    }

    private boolean sameRuntimeLayout(RuntimeManifest current, RuntimeManifest target) {
        if (current == null || target == null) {
            return false;
        }
        return Objects.equals(current.containerName(), target.containerName())
                && Objects.equals(current.composeProject(), target.composeProject())
                && Objects.equals(current.network(), target.network())
                && Objects.equals(current.runtimeRoot(), target.runtimeRoot())
                && Objects.equals(current.ports(), target.ports())
                && Objects.equals(current.volumes(), target.volumes())
                && Objects.equals(current.environment(), target.environment())
                && labelsWithoutVersion(current.labels()).equals(labelsWithoutVersion(target.labels()))
                && Objects.equals(current.backupPaths(), target.backupPaths())
                && Objects.equals(current.backupStrategy(), target.backupStrategy())
                && current.backupContractVersion() == target.backupContractVersion()
                && current.privileged() == target.privileged()
                && sameServices(current.services(), target.services());
    }

    private boolean sameServices(List<RuntimeServiceManifest> current, List<RuntimeServiceManifest> target) {
        List<RuntimeServiceManifest> left = current == null ? List.of() : current;
        List<RuntimeServiceManifest> right = target == null ? List.of() : target;
        if (left.size() != right.size()) {
            return false;
        }
        for (int index = 0; index < left.size(); index++) {
            RuntimeServiceManifest before = left.get(index);
            RuntimeServiceManifest after = right.get(index);
            if (!Objects.equals(before.name(), after.name())
                    || !Objects.equals(before.containerName(), after.containerName())
                    || !Objects.equals(before.ports(), after.ports())
                    || !Objects.equals(before.volumes(), after.volumes())
                    || !Objects.equals(before.environment(), after.environment())
                    || !Objects.equals(before.dependsOn(), after.dependsOn())
                    || !labelsWithoutVersion(before.labels()).equals(labelsWithoutVersion(after.labels()))
                    || before.privileged() != after.privileged()) {
                return false;
            }
        }
        return true;
    }

    private List<String> labelsWithoutVersion(List<String> labels) {
        return (labels == null ? List.<String>of() : labels).stream()
                .filter(label -> !label.startsWith("autark-os.version="))
                .toList();
    }

    private List<String> imagesForRuntimeManifest(ApplicationManifest manifest) {
        if (manifest == null || manifest.runtime() == null) {
            return List.of();
        }
        if (!manifest.runtime().multiService()) {
            return blankFree(List.of(manifest.runtime().image()));
        }
        return blankFree(manifest.runtime().services().stream().map(RuntimeServiceManifest::image).toList());
    }

    private List<String> blankFree(List<String> images) {
        return images.stream().filter(image -> image != null && !image.isBlank()).map(String::trim).toList();
    }

    private String withResolvedImages(String compose, List<String> images, String release) {
        Map<String, String> digests = composeExecutor.imageDigests(images);
        List<String> immutableImages = new ArrayList<>();
        for (String image : images) {
            String digest = digests.get(image);
            if (digest == null || !digest.contains("@sha256:")) {
                throw new InstallationException("Autark-OS could not resolve an immutable image digest for the " + release + ".");
            }
            immutableImages.add(digest);
        }
        return replaceImages(compose, immutableImages);
    }

    private boolean immutableImagesAvailable(List<String> images) {
        Map<String, String> digests = composeExecutor.imageDigests(images);
        return images.stream().allMatch(image -> {
            String digest = digests.get(image);
            return digest != null && digest.contains("@sha256:");
        });
    }

    private String replaceImages(String compose, List<String> images) {
        Matcher matcher = IMAGE_LINE.matcher(compose == null ? "" : compose);
        StringBuffer rewritten = new StringBuffer();
        int index = 0;
        while (matcher.find()) {
            if (index >= images.size()) {
                throw new InstallationException("The deployed Compose file does not match the catalog release.");
            }
            matcher.appendReplacement(rewritten, Matcher.quoteReplacement(matcher.group(1) + images.get(index++)));
        }
        matcher.appendTail(rewritten);
        if (index != images.size()) {
            throw new InstallationException("The deployed Compose file does not expose every catalog image.");
        }
        return rewritten.toString();
    }

    private int countImageLines(String compose) {
        Matcher matcher = IMAGE_LINE.matcher(compose == null ? "" : compose);
        int count = 0;
        while (matcher.find()) {
            count++;
        }
        return count;
    }

    private Path stageCompose(InstalledApp app, String contents) {
        Path stage = Path.of(app.runtimePath()).resolve(".autark-os-update-stage.yaml").normalize();
        try {
            Files.writeString(stage, contents);
            return stage;
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not stage the app update.", exception);
        }
    }

    private void deleteStage(InstalledApp app) {
        try {
            Files.deleteIfExists(Path.of(app.runtimePath()).resolve(".autark-os-update-stage.yaml"));
        } catch (IOException ignored) {
            // The staged file contains no secrets and will be replaced before the next update.
        }
    }

    private void writeCompose(InstalledApp app, String contents) {
        Path compose = composeFile(app);
        Path temporary = compose.resolveSibling("compose.yaml.update");
        try {
            Files.writeString(temporary, contents);
            try {
                Files.move(temporary, compose, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (java.nio.file.AtomicMoveNotSupportedException exception) {
                Files.move(temporary, compose, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not apply the staged app release.", exception);
        }
    }

    private void assertHealthy(InstalledApp app) {
        AppHealthSnapshot health = lifecycleService.healthSnapshot(app.appId());
        if (health == null || !List.of(AutarkOsStates.AppStatus.READY, AutarkOsStates.AppStatus.STARTING).contains(health.status())) {
            String detail = health == null ? "No app health result was returned." : health.message();
            throw new InstallationException("The updated app did not pass its health check. " + detail);
        }
    }

    private boolean healthyForUpdate(InstalledApp app) {
        AppHealthSnapshot health = lifecycleService.healthSnapshot(app.appId());
        return health != null && List.of(AutarkOsStates.AppStatus.READY, AutarkOsStates.AppStatus.STARTING).contains(health.status());
    }

    private void assertVerifiedSafetyCheckpoint(BackupModels.BackupRunResult backup, InstalledApp app) {
        if (backup == null || backup.restorePoint() == null
                || !AutarkOsStates.RestorePointStatus.COMPLETED.equals(backup.status())
                || !AutarkOsStates.RestorePointStatus.VERIFIED.equals(backup.restorePoint().verificationStatus())) {
            String message = backup == null ? "No backup result was returned." : backup.message();
            throw new InstallationException("Autark-OS could not create a verified safety checkpoint for " + app.appName() + ". " + message);
        }
    }

    private boolean backupReady(InstalledApp app) {
        return installedApps.settingsFor(app.appId()).map(settings -> settings.backup() != null && settings.backup().enabled()).orElse(false)
                && backupService.destination().ready();
    }

    private void assertOwned(InstalledApp app) {
        String ownership = installedApps.ownershipFor(app.appId()).map(RuntimeModels.InstalledAppOwnershipMetadata::ownershipStatus).orElse("");
        if (!AutarkOsStates.OwnershipState.OWNED_MANAGED.equals(ownership)) {
            throw new InstallationException("Only apps managed by this Autark-OS instance can be updated.");
        }
    }

    private InstalledApp installedApp(String appId) {
        if (appId == null || appId.isBlank()) {
            throw new InstallationException("Choose an installed app before changing its release.");
        }
        return installedApps.findAppById(appId.trim())
                .orElseThrow(() -> new InstallationException("App is not installed: " + appId));
    }

    private ApplicationManifest readRuntimeManifest(InstalledApp app) {
        Path manifest = Path.of(app.runtimePath()).resolve("manifest.yaml");
        if (!Files.isRegularFile(manifest)) {
            throw new InstallationException("The original app manifest is missing, so Autark-OS cannot plan a reversible update.");
        }
        try {
            return manifestReader.read(new FileSystemResource(manifest));
        } catch (RuntimeException exception) {
            throw new InstallationException("Autark-OS could not read this app's saved release manifest.", exception);
        }
    }

    private String currentVersion(InstalledApp app) {
        RuntimeModels.AppRuntimeMetadata metadata = metadataReader.read(Path.of(app.runtimePath())).orElse(null);
        return version(metadata == null ? "" : metadata.manifestVersion(), readRuntimeManifest(app).version());
    }

    private String readCompose(InstalledApp app) {
        return read(composeFile(app));
    }

    private String read(Path file) {
        try {
            return Files.readString(file);
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not read the deployed Compose file.", exception);
        }
    }

    private Path composeFile(InstalledApp app) {
        Path compose = Path.of(app.runtimePath()).resolve("compose.yaml");
        if (!Files.isRegularFile(compose)) {
            throw new InstallationException("The original Compose file is missing, so Autark-OS cannot perform a reversible update.");
        }
        return compose;
    }

    private UpdateModels.AppUpdatePlan unavailablePlan(String appId, String operation) {
        UpdateModels.AppUpdateCapability capability = capability();
        return UpdateModels.AppUpdatePlan.blocked(appId, "App", operation, capability.headline(), capability.summary(), List.of(capability.summary()));
    }

    private UpdateModels.AppUpdatePlan blocked(InstalledApp app, String operation, String headline, String summary, List<String> reasons) {
        return new UpdateModels.AppUpdatePlan(
                app.appId(), app.appName(), operation, "blocked", headline, summary, "", "", false, true,
                snapshots.latestRollbackFor(app.appId()).isPresent(), snapshots.latestRollbackFor(app.appId()).map(AppUpdateSnapshot::snapshotId).orElse(""),
                List.of(), List.copyOf(reasons), Instant.now());
    }

    private String firstReason(UpdateModels.AppUpdatePlan plan, String fallback) {
        return plan.blockedReasons().stream().filter(reason -> reason != null && !reason.isBlank()).findFirst().orElse(fallback);
    }

    private boolean configured() {
        return installedApps != null;
    }

    private String version(String primary, String fallback) {
        String value = primary == null || primary.isBlank() ? fallback : primary;
        return value == null || value.isBlank() ? "unknown" : value.trim();
    }

    private int compareVersions(String target, String current) {
        if (Objects.equals(target, current)) {
            return 0;
        }
        List<String> left = versionParts(target);
        List<String> right = versionParts(current);
        int length = Math.max(left.size(), right.size());
        for (int index = 0; index < length; index++) {
            String targetPart = index < left.size() ? left.get(index) : "0";
            String currentPart = index < right.size() ? right.get(index) : "0";
            int compared = compareVersionPart(targetPart, currentPart);
            if (compared != 0) {
                return compared;
            }
        }
        return target.compareTo(current);
    }

    private List<String> versionParts(String version) {
        Matcher matcher = VERSION_PART.matcher(version == null ? "" : version);
        List<String> parts = new ArrayList<>();
        while (matcher.find()) {
            parts.add(matcher.group());
        }
        return parts.isEmpty() ? List.of(version == null ? "" : version) : parts;
    }

    private int compareVersionPart(String target, String current) {
        boolean targetNumeric = target.matches("\\d+");
        boolean currentNumeric = current.matches("\\d+");
        if (targetNumeric && currentNumeric) {
            return new BigInteger(target).compareTo(new BigInteger(current));
        }
        if (targetNumeric != currentNumeric) {
            return targetNumeric ? 1 : -1;
        }
        return target.compareToIgnoreCase(current);
    }

    private String safeMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank() ? "Unknown recovery error." : exception.getMessage();
    }

    private record UpdateContext(
            InstalledApp app,
            ApplicationManifest currentManifest,
            ApplicationManifest targetManifest,
            RuntimeModels.AppRuntimeMetadata metadata,
            String currentVersion,
            String targetVersion,
            int versionComparison,
            List<String> currentImages,
            List<String> targetImages) {
    }
}
