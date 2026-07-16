package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.HealthManifest;

class AppHealthService {

    private final InstalledAppRepository repository;
    private final DockerComposeExecutor composeExecutor;
    private final MarketplaceCatalogService catalogService;
    private final AppRuntimeStatusResolver runtimeStatusResolver;
    private final AppSettingsPolicy settingsPolicy;
    private final AppAccessChecker accessChecker;
    private final ActivityLogService activityLogService;
    private final PrivateAccessStateResolver privateAccessStateResolver;

    AppHealthService(
            InstalledAppRepository repository,
            DockerComposeExecutor composeExecutor,
            MarketplaceCatalogService catalogService,
            AppRuntimeStatusResolver runtimeStatusResolver,
            AppSettingsPolicy settingsPolicy,
            AppAccessChecker accessChecker,
            ActivityLogService activityLogService,
            PrivateAccessStateResolver privateAccessStateResolver) {
        this.repository = repository;
        this.composeExecutor = composeExecutor;
        this.catalogService = catalogService;
        this.runtimeStatusResolver = runtimeStatusResolver;
        this.settingsPolicy = settingsPolicy;
        this.accessChecker = accessChecker;
        this.activityLogService = activityLogService;
        this.privateAccessStateResolver = privateAccessStateResolver;
    }

    AppHealthSnapshot healthSnapshot(InstalledApp app) {
        List<RuntimeModels.DockerContainerStatus> containers = composeExecutor.containersForApp(composeFile(app), app.composeProject(), app.appId());
        AppRuntimeStatus runtime = runtimeStatusResolver.normalize(containers);
        ApplicationManifest manifest = catalogService.findById(app.appId()).orElse(null);
        String accessUrl = runtimeStatusResolver.accessUrl(app, manifest, containers);
        InstallModels.InstallSettings settings = settingsPolicy.normalizeSettings(repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(accessUrl)), app, manifest, accessUrl);
        AccessModels.AppAccessCheck localCheck = accessChecker.shouldCheckLocalAccess(manifest, accessUrl)
                ? accessChecker.localHealthCheck(app.appId(), manifest, accessUrl)
                : AccessModels.AppAccessCheck.notConfigured(app.appId());
        PrivateAccessState privateAccess = privateAccessStateResolver.resolve(app.appId(), settings, accessUrl);
        AccessModels.AppAccessCheck privateCheck = privateAccessCheck(app.appId(), privateAccess);
        settings = updateAccessCheckTimestamps(app, settings, localCheck);
        AppHealthSnapshot snapshot = buildHealthSnapshot(app, runtime, manifest, settings, localCheck, privateCheck);
        repository.healthFor(app.appId())
                .filter(previous -> !previous.status().equals(snapshot.status()))
                .ifPresent(previous -> {
                    String message = app.appName() + " changed from " + previous.status() + " to " + snapshot.status() + ".";
                    repository.recordEvent(app.appId(), "health_changed", message);
                    if (AutarkOsStates.AppStatus.READY.equals(snapshot.status())) {
                        activitySuccess("health_changed", app.appName() + " is ready", message, app.appId());
                    } else {
                        activityWarning("health_changed", app.appName() + " needs attention", message, app.appId());
                    }
                });
        repository.saveHealthSnapshot(snapshot);
        return snapshot;
    }

    private InstallModels.InstallSettings updateAccessCheckTimestamps(InstalledApp app, InstallModels.InstallSettings settings, AccessModels.AppAccessCheck localCheck) {
        if ("not_configured".equals(localCheck.status())) {
            return settings;
        }
        InstallModels.InstallSettings updated = new InstallModels.InstallSettings(
                settings.accessUrl(),
                settings.privateAccessUrl(),
                settings.tailscaleEnabled(),
                settings.storageSubfolders(),
                settings.backup(),
                settings.desiredAccessMode(),
                settings.privateAccessRequirement(),
                settings.expectedLocalPort(),
                settings.expectedProtocol(),
                localCheck.checkedAt(),
                "reachable".equals(localCheck.status()) ? localCheck.checkedAt() : settings.lastSuccessfulAccessAt(),
                settings.lastRepairAttemptAt(),
                settings.lastRepairStatus(),
                settings.autoRepairEnabled());
        repository.saveSettings(app.appId(), updated);
        return updated;
    }

    private AppHealthSnapshot buildHealthSnapshot(InstalledApp app, AppRuntimeStatus runtime, ApplicationManifest manifest, InstallModels.InstallSettings settings, AccessModels.AppAccessCheck localCheck, AccessModels.AppAccessCheck privateCheck) {
        Instant now = Instant.now();
        HealthManifest health = accessChecker.healthContract(manifest);
        Duration startupGracePeriod = Duration.ofSeconds(health.startupGraceSeconds());
        boolean startupGrace = AutarkOsStates.AppStatus.STARTING.equals(runtime.friendlyStatus()) && app.installedAt().plus(startupGracePeriod).isAfter(now);
        boolean localRequired = accessChecker.shouldCheckLocalAccess(manifest, localCheck.url());
        boolean localBroken = localRequired && "unreachable".equals(localCheck.status());
        boolean privateBroken = settings != null
                && "required".equals(settings.privateAccessRequirement())
                && !"verified".equals(privateCheck.status());
        boolean containerOnly = Set.of("container", "no-web-ui", "none").contains(health.type());

        String status;
        String message;
        String detail;
        if (AutarkOsStates.AppStatus.READY.equals(runtime.friendlyStatus()) && !localBroken && !privateBroken) {
            status = AutarkOsStates.AppStatus.READY;
            message = health.successLabel();
            detail = containerOnly ? health.description() : "Docker is running and expected links are responding.";
        } else if (AutarkOsStates.AppStatus.STARTING.equals(runtime.friendlyStatus()) && startupGrace) {
            status = AutarkOsStates.AppStatus.STARTING;
            message = health.startingLabel();
            detail = "Autark-OS is giving this app up to " + health.startupGraceSeconds() + " seconds to finish startup before marking it as unhealthy.";
        } else if (AutarkOsStates.AppStatus.STOPPED.equals(runtime.friendlyStatus())) {
            status = AutarkOsStates.AppStatus.PAUSED;
            message = "Paused";
            detail = "The app containers are stopped. Start the app when you want to use it.";
        } else if (AutarkOsStates.AppStatus.STOPPED.equals(runtime.friendlyStatus()) || "not running".equals(runtime.healthCheck())) {
            status = AutarkOsStates.AppStatus.UNAVAILABLE;
            message = "Unavailable";
            detail = "Autark-OS could not find running managed containers for this app.";
        } else if (localBroken) {
            status = AutarkOsStates.AppStatus.NEEDS_ATTENTION;
            message = health.failureLabel();
            detail = "Docker reports the app is running, but the local app link did not answer.";
        } else if (privateBroken) {
            status = AutarkOsStates.AppStatus.NEEDS_ATTENTION;
            message = "Private link needs repair";
            detail = privateCheck.message() == null || privateCheck.message().isBlank()
                    ? "Private access is required, but the expected Tailscale Serve mapping is not verified."
                    : privateCheck.message();
        } else if (AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(runtime.friendlyStatus())) {
            status = AutarkOsStates.AppStatus.NEEDS_ATTENTION;
            message = "Container health check is failing";
            detail = runtime.technicalStatus();
        } else if (AutarkOsStates.AppStatus.STARTING.equals(runtime.friendlyStatus())) {
            status = AutarkOsStates.AppStatus.NEEDS_ATTENTION;
            message = "Startup is taking longer than expected";
            detail = "This app is still starting after its expected startup window of " + health.startupGraceSeconds() + " seconds.";
        } else {
            status = AutarkOsStates.AppStatus.UNAVAILABLE;
            message = "Status is unclear";
            detail = runtime.technicalStatus();
        }
        return new AppHealthSnapshot(
                app.appId(),
                status,
                message,
                detail,
                runtime.friendlyStatus(),
                localCheck.status(),
                privateCheck.status(),
                startupGrace,
                now);
    }

    private AccessModels.AppAccessCheck privateAccessCheck(String appId, PrivateAccessState state) {
        if (state == null || "not_enabled".equals(state.status())) {
            return AccessModels.AppAccessCheck.notConfigured(appId);
        }
        return new AccessModels.AppAccessCheck(
                appId,
                state.verified() ? state.verifiedPrivateUrl() : state.expectedPrivateUrl(),
                state.status(),
                state.message(),
                Instant.now());
    }

    private Path composeFile(InstalledApp app) {
        return Path.of(app.runtimePath()).resolve("compose.yaml");
    }

    private void activitySuccess(String action, String title, String message, String appId) {
        if (activityLogService != null) {
            activityLogService.success("applications", action, title, message, appId);
        }
    }

    private void activityWarning(String action, String title, String message, String appId) {
        if (activityLogService != null) {
            activityLogService.warning("applications", action, title, message, appId);
        }
    }
}
