package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.backups.BackupRepository;
import com.autarkos.backups.BackupProtectionPolicy;
import com.autarkos.backups.BackupDestinationService;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.backups.RestorePoints;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.marketplace.install.models.GuideModels;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.ReliabilityModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.tailscale.TailscaleServeResult;
import com.autarkos.network.tailscale.TailscaleService;

@Service
public class AppLifecycleService {

    private static final int EVENT_LIMIT = 8;
    private final InstalledAppRepository repository;
    private final DockerComposeExecutor composeExecutor;
    private final MarketplaceCatalogService catalogService;
    private final RuntimeLayout runtimeLayout;
    private final PostInstallGuideBuilder postInstallGuideBuilder;
    private final TailscaleService tailscaleService;
    private final AppAccessChecker accessChecker;
    private final ActivityLogService activityLogService;
    private final BackupRepository backupRepository;
    private final AppTelemetryService appTelemetryService;
    private final AppRuntimeMetadataReader appRuntimeMetadataReader = new AppRuntimeMetadataReader();
    private final AppRuntimeStatusResolver runtimeStatusResolver = new AppRuntimeStatusResolver();
    private final AppSettingsPolicy settingsPolicy;
    private final AppUninstallService uninstallService;
    private final AppHealthService healthService;
    private final AppContainerLifecycleService containerLifecycleService;
    private final AppReliabilityService reliabilityService;
    private final PrivateAccessStateResolver privateAccessStateResolver;
    public AppLifecycleService(InstalledAppRepository repository, DockerComposeExecutor composeExecutor, MarketplaceCatalogService catalogService, ManagedContainerDiscovery managedContainerDiscovery, RuntimeLayout runtimeLayout, PostInstallGuideBuilder postInstallGuideBuilder, TailscaleService tailscaleService, @Value("${autark-os.dev-mode:false}") boolean devMode, ActivityLogService activityLogService, BackupRepository backupRepository, AppTelemetryService appTelemetryService, BackupDestinationService backupDestinationService) {
        this(repository, composeExecutor, catalogService, managedContainerDiscovery, runtimeLayout, postInstallGuideBuilder, tailscaleService, devMode, activityLogService, backupRepository, appTelemetryService, backupDestinationService, new RecoveryOperationCoordinator());
    }

    @Autowired
    public AppLifecycleService(InstalledAppRepository repository, DockerComposeExecutor composeExecutor, MarketplaceCatalogService catalogService, ManagedContainerDiscovery managedContainerDiscovery, RuntimeLayout runtimeLayout, PostInstallGuideBuilder postInstallGuideBuilder, TailscaleService tailscaleService, @Value("${autark-os.dev-mode:false}") boolean devMode, ActivityLogService activityLogService, BackupRepository backupRepository, AppTelemetryService appTelemetryService, BackupDestinationService backupDestinationService, RecoveryOperationCoordinator recoveryOperations) {
        this.repository = repository;
        this.composeExecutor = composeExecutor;
        this.catalogService = catalogService;
        this.runtimeLayout = runtimeLayout;
        this.postInstallGuideBuilder = postInstallGuideBuilder;
        this.tailscaleService = tailscaleService;
        this.accessChecker = new AppAccessChecker();
        this.settingsPolicy = new AppSettingsPolicy(repository, runtimeStatusResolver);
        this.privateAccessStateResolver = new PrivateAccessStateResolver(repository, tailscaleService);
        this.uninstallService = new AppUninstallService(repository, composeExecutor, runtimeLayout, backupRepository, tailscaleService, activityLogService, backupDestinationService, recoveryOperations);
        this.healthService = new AppHealthService(repository, composeExecutor, catalogService, runtimeStatusResolver, settingsPolicy, accessChecker, activityLogService, privateAccessStateResolver);
        this.containerLifecycleService = new AppContainerLifecycleService(repository, composeExecutor, activityLogService, this::refresh);
        this.reliabilityService = new AppReliabilityService(repository, tailscaleService);
        this.activityLogService = activityLogService;
        this.backupRepository = backupRepository;
        this.appTelemetryService = appTelemetryService;
    }

    public AppLifecycleService(InstalledAppRepository repository, DockerComposeExecutor composeExecutor, MarketplaceCatalogService catalogService, ManagedContainerDiscovery managedContainerDiscovery, RuntimeLayout runtimeLayout, PostInstallGuideBuilder postInstallGuideBuilder, TailscaleService tailscaleService, @Value("${autark-os.dev-mode:false}") boolean devMode, ActivityLogService activityLogService, BackupRepository backupRepository, AppTelemetryService appTelemetryService) {
        this(repository, composeExecutor, catalogService, managedContainerDiscovery, runtimeLayout, postInstallGuideBuilder, tailscaleService, devMode, activityLogService, backupRepository, appTelemetryService, null);
    }

    public AppLifecycleService(InstalledAppRepository repository, DockerComposeExecutor composeExecutor, MarketplaceCatalogService catalogService, ManagedContainerDiscovery managedContainerDiscovery, RuntimeLayout runtimeLayout, PostInstallGuideBuilder postInstallGuideBuilder, TailscaleService tailscaleService, @Value("${autark-os.dev-mode:false}") boolean devMode, ActivityLogService activityLogService, BackupRepository backupRepository) {
        this(repository, composeExecutor, catalogService, managedContainerDiscovery, runtimeLayout, postInstallGuideBuilder, tailscaleService, devMode, activityLogService, backupRepository, new AppTelemetryService(composeExecutor), null);
    }

    public List<AppRuntimeView> listApps() {
        return managedInstalledApps().stream()
                .map(this::refresh)
                .toList();
    }

    public AppRuntimeView getApp(String appId) {
        return refresh(installedApp(appId));
    }

    public RuntimeModels.AppTelemetry telemetry(String appId) {
        return appTelemetryService.telemetry(installedApp(appId));
    }

    public Map<String, RuntimeModels.AppTelemetry> telemetry() {
        return appTelemetryService.telemetryForApps(managedInstalledApps());
    }

    public Map<String, AccessModels.AppAccessCheck> accessChecks() {
        Map<String, AccessModels.AppAccessCheck> checks = new LinkedHashMap<>();
        for (InstalledApp app : managedInstalledApps()) {
            String accessUrl = repository.settingsFor(app.appId())
                    .map(InstallModels.InstallSettings::accessUrl)
                    .filter(url -> url != null && !url.isBlank())
                    .orElse(app.accessUrl());
            checks.put(app.appId(), accessChecker.accessCheck(app.appId(), accessUrl));
        }
        return checks;
    }

    public Map<String, AppHealthSnapshot> healthSnapshots() {
        Map<String, AppHealthSnapshot> snapshots = new LinkedHashMap<>();
        for (InstalledApp app : managedInstalledApps()) {
            AppHealthSnapshot snapshot = healthService.healthSnapshot(app);
            snapshots.put(app.appId(), snapshot);
        }
        return snapshots;
    }

    public ReliabilityModels.AppReliabilitySummary reliabilitySummary() {
        return reliabilityService.summarize(managedInstalledApps());
    }

    public AppHealthSnapshot healthSnapshot(String appId) {
        return healthService.healthSnapshot(installedApp(appId));
    }

    public AppActionResult start(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "start");
        assertComposeAvailable(app, "start");
        return containerLifecycleService.start(app, composeFile(app));
    }

    public AppActionResult stop(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "stop");
        return containerLifecycleService.stop(app, composeFile(app));
    }

    /**
     * Stops a managed app and confirms that Docker no longer reports one of its
     * containers as running. Backup and restore use this stricter operation so
     * a successful command alone is never treated as a safe quiescent state.
     */
    public AppActionResult stopAndConfirm(String appId) {
        InstalledApp app = installedApp(appId);
        AppActionResult result = stop(appId);
        RuntimeModels.DockerComposeResult status = composeExecutor.ps(composeFile(app), app.composeProject());
        if (!status.successful()) {
            throw new InstallationException("Autark-OS stopped " + app.appName() + " but could not confirm its container state.");
        }
        boolean stillRunning = composeExecutor.containersForApp(composeFile(app), app.composeProject(), app.appId()).stream()
                .anyMatch(container -> {
                    String state = container.state() == null ? "" : container.state().trim().toLowerCase();
                    return "running".equals(state) || "restarting".equals(state);
                });
        if (stillRunning) {
            throw new InstallationException("Autark-OS could not confirm that " + app.appName() + " is stopped. No backup or restore data was changed.");
        }
        return result;
    }

    public AppActionResult restart(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "restart");
        assertComposeAvailable(app, "restart");
        return containerLifecycleService.restart(app, composeFile(app));
    }

    public AppActionResult repair(String appId) {
        return repair(appId, false);
    }

    AppActionResult repair(String appId, boolean automatic) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "repair");
        assertComposeAvailable(app, "repair");
        AppHealthSnapshot before = healthService.healthSnapshot(app);
        List<String> logs = new java.util.ArrayList<>();
        logs.add("Before repair: " + before.status() + " - " + before.message());
        String eventPrefix = automatic ? "guardian_" : "";

        boolean repairingPrivateAccess = shouldRepairPrivateAccess(before);
        if (AutarkOsStates.AppStatus.READY.equals(before.status()) && !repairingPrivateAccess) {
            saveRepairState(app, automatic ? "guardian_skipped_ready" : "manual_skipped_ready");
            repository.recordEvent(app.appId(), eventPrefix + "repair_skipped", app.appName() + " already looked ready.");
            activityInfo(eventPrefix + "repair_skipped", "Repair skipped for " + app.appName(), app.appName() + " already looks ready.", app.appId());
            return new AppActionResult(app.appId(), "repair", "skipped", app.appName() + " already looks ready. No repair was needed.", refresh(app), logs, Instant.now());
        }

        saveRepairState(app, automatic ? "guardian_repair_running" : "manual_repair_running");
        repository.recordEvent(app.appId(), eventPrefix + "repair_started", "Autark-OS noticed: " + before.message() + ". " + repairPlanLabel(before));
        activityWarning(eventPrefix + "repair_started", "Repair started for " + app.appName(), before.message() + ". " + repairPlanLabel(before), app.appId());
        if (repairingPrivateAccess) {
            try {
                AppActionResult result = enablePrivateAccess(appId);
                logs.addAll(result.logs() == null ? List.of() : result.logs());
            } catch (RuntimeException exception) {
                saveRepairState(app, automatic ? "guardian_repair_failed" : "manual_repair_failed");
                repository.recordEvent(app.appId(), eventPrefix + "repair_failed", failureReason(exception));
                activityError(eventPrefix + "repair_failed", "Repair failed for " + app.appName(), failureReason(exception), app.appId(), exception);
                throw exception;
            }
        } else if (AutarkOsStates.AppStatus.PAUSED.equals(before.status())) {
            RuntimeModels.DockerComposeResult result = composeExecutor.up(composeFile(app), app.composeProject());
            logs.addAll(result.output());
            if (!result.successful()) {
                saveRepairState(app, automatic ? "guardian_repair_failed" : "manual_repair_failed");
                repository.recordEvent(app.appId(), eventPrefix + "repair_failed", failureReason(result.output()));
                activityWarning(eventPrefix + "repair_failed", "Repair failed for " + app.appName(), failureReason(result.output()), app.appId());
                throw new InstallationException("Autark-OS could not start " + app.appName() + ". Check recent activity for details.");
            }
            repository.recordEvent(app.appId(), eventPrefix + "repair_step_completed", "Started " + app.appName() + " as part of repair.");
        } else {
            RuntimeModels.DockerComposeResult result = composeExecutor.restart(composeFile(app), app.composeProject());
            logs.addAll(result.output());
            if (!result.successful()) {
                saveRepairState(app, automatic ? "guardian_repair_failed" : "manual_repair_failed");
                repository.recordEvent(app.appId(), eventPrefix + "repair_failed", failureReason(result.output()));
                activityWarning(eventPrefix + "repair_failed", "Repair failed for " + app.appName(), failureReason(result.output()), app.appId());
                throw new InstallationException("Autark-OS could not restart " + app.appName() + ". Check recent activity for details.");
            }
            repository.recordEvent(app.appId(), eventPrefix + "repair_step_completed", "Restarted " + app.appName() + " as part of repair.");
        }

        AppHealthSnapshot after = healthService.healthSnapshot(app);
        logs.add("After repair: " + after.status() + " - " + after.message());
        boolean privateAccessRepaired = repairingPrivateAccess && "verified".equals(after.privateAccessStatus());
        String status = AutarkOsStates.AppStatus.READY.equals(after.status()) || AutarkOsStates.AppStatus.STARTING.equals(after.status()) || privateAccessRepaired ? AutarkOsStates.RestorePointStatus.COMPLETED : "needs_attention";
        String message = repairMessage(app, before, after, privateAccessRepaired);
        saveRepairState(app, automatic ? "guardian_repair_" + status : "manual_repair_" + status);
        repository.recordEvent(app.appId(), eventPrefix + "repair_completed", message);
        if (AutarkOsStates.RestorePointStatus.COMPLETED.equals(status)) {
            activitySuccess(eventPrefix + "repair_completed", "Repair completed for " + app.appName(), message, app.appId());
        } else {
            activityWarning(eventPrefix + "repair_needs_attention", "Repair still needs attention for " + app.appName(), message, app.appId());
        }
        return new AppActionResult(app.appId(), "repair", status, message, refresh(app), logs, Instant.now());
    }

    public AppRuntimeView updateSettings(String appId, InstallModels.InstallSettings settings) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "update settings for");
        assertComposeAvailable(app, "update settings for");
        String defaultAccessUrl = app.accessUrl();
        InstallModels.InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(defaultAccessUrl));
        InstallModels.InstallSettings sanitized = settingsPolicy.sanitize(settings, app);
        InstallModels.AppSettingsChangePlan plan = settingsPolicy.settingsChangePlan(app, current, sanitized);
        repository.recordEvent(app.appId(), "settings_change_planned", plan.summary());
        activityInfo("settings_change_planned", "Settings change planned for " + app.appName(), plan.summary(), app.appId());
        if (!plan.saveAllowed()) {
            repository.recordEvent(app.appId(), "settings_change_blocked", String.join(" ", plan.blockedReasons()));
            activityWarning("settings_change_blocked", "Settings change blocked for " + app.appName(), String.join(" ", plan.blockedReasons()), app.appId());
            throw new InstallationException(String.join(" ", plan.blockedReasons()));
        }
        repository.recordEvent(app.appId(), "settings_apply_started", "Applying settings change for " + app.appName() + ".");
        activityInfo("settings_apply_started", "Applying settings for " + app.appName(), plan.summary(), app.appId());
        if (current.tailscaleEnabled() && !sanitized.tailscaleEnabled()) {
            TailscaleServeResult disableResult = disablePrivateAccessMapping(app, current);
            sanitized = new InstallModels.InstallSettings(
                    sanitized.accessUrl(),
                    null,
                    false,
                    sanitized.storageSubfolders(),
                    sanitized.backup(),
                    "local",
                    "disabled",
                    sanitized.expectedLocalPort(),
                    sanitized.expectedProtocol(),
                    sanitized.lastAccessCheckAt(),
                    sanitized.lastSuccessfulAccessAt(),
                    Instant.now(),
                    disableResult.configured() ? "private_access_disabled" : "private_access_disable_failed",
                    sanitized.autoRepairEnabled());
            repository.recordEvent(app.appId(), "private_access_disabled", "Removed private HTTPS link for " + app.appName() + ".");
            activitySuccess("private_access_disabled", "Private link removed for " + app.appName(), "Autark-OS turned off private access for this app.", app.appId());
        } else if (!sanitized.tailscaleEnabled() && sanitized.privateAccessUrl() != null) {
            sanitized = new InstallModels.InstallSettings(
                    sanitized.accessUrl(),
                    null,
                    false,
                    sanitized.storageSubfolders(),
                    sanitized.backup(),
                    "local",
                    "disabled",
                    sanitized.expectedLocalPort(),
                    sanitized.expectedProtocol(),
                    sanitized.lastAccessCheckAt(),
                    sanitized.lastSuccessfulAccessAt(),
                    sanitized.lastRepairAttemptAt(),
                    sanitized.lastRepairStatus(),
                    sanitized.autoRepairEnabled());
        }
        if (plan.redeployRequired()) {
            safeRedeployForSettings(app, sanitized);
            app = new InstalledApp(
                    app.appId(),
                    app.appName(),
                    app.status(),
                    app.runtimePath(),
                    app.composeProject(),
                    sanitized.accessUrl(),
                    app.installedAt());
            repository.save(app);
        }
        repository.saveSettings(app.appId(), sanitized);
        repository.recordEvent(app.appId(), "settings_updated", "Updated application settings for " + app.appName() + ".");
        repository.recordEvent(app.appId(), "settings_apply_completed", "Applied settings for " + app.appName() + ".");
        activitySuccess("settings_updated", "Updated settings for " + app.appName(), "Application settings were saved.", app.appId());
        return refresh(app);
    }

    public InstallModels.AppSettingsChangePlan settingsChangePlan(String appId, InstallModels.InstallSettings settings) {
        InstalledApp app = installedApp(appId);
        if (!AppRuntimeFiles.isComposeFile(composeFile(app))) {
            String reason = "The original Compose file is missing. Settings cannot be changed until that configuration is restored.";
            return new InstallModels.AppSettingsChangePlan(
                    app.appId(), app.appName(), "blocked", "Settings unavailable", reason,
                    false, false, false, false, List.of(), List.of(), List.of(reason));
        }
        InstallModels.InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(app.accessUrl()));
        return settingsPolicy.settingsChangePlan(app, current, settingsPolicy.sanitize(settings, app));
    }

    private void safeRedeployForSettings(InstalledApp app, InstallModels.InstallSettings settings) {
        ApplicationManifest manifest = catalogService.findById(app.appId())
                .orElseThrow(() -> new InstallationException("Autark-OS could not find the catalog template for " + app.appName() + "."));
        Path appRoot = Path.of(app.runtimePath());
        Path composePath = appRoot.resolve("compose.yaml");
        String previousCompose = readCompose(composePath);
        boolean restored = false;
        try {
            InstallOptionsRequest options = new InstallOptionsRequest(
                    new InstallOptionsRequest.PortOptions(settings.expectedLocalPort()),
                    new InstallOptionsRequest.AccessOptions(settings.tailscaleEnabled()),
                    new InstallOptionsRequest.StorageOptions(settings.storageSubfolders()),
                    new InstallOptionsRequest.BackupOptions(settings.backup().enabled(), settings.backup().frequency(), settings.backup().retention()));
            RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration = new InstallCustomizationResolver(new PortAllocator()).resolve(manifest, options);
            new ComposeRenderer(runtimeLayout).render(manifest, appRoot, runtimeConfiguration);
            RuntimeModels.DockerComposeResult result = composeExecutor.up(composePath, app.composeProject());
            if (!result.successful()) {
                restoreCompose(composePath, previousCompose);
                restored = true;
                repository.recordEvent(app.appId(), "settings_redeploy_failed", failureReason(result.output()));
                activityWarning("settings_redeploy_failed", "Settings redeploy failed for " + app.appName(), failureReason(result.output()), app.appId());
                throw new InstallationException("Autark-OS could not restart " + app.appName() + " with the new settings. The previous Compose file was restored.");
            }
            repository.recordEvent(app.appId(), "settings_redeploy_completed", "Updated Compose and restarted " + app.appName() + ".");
            activitySuccess("settings_redeploy_completed", "Settings redeploy completed for " + app.appName(), "Autark-OS updated Compose and restarted the app.", app.appId());
        } catch (RuntimeException exception) {
            if (!restored) {
                restoreCompose(composePath, previousCompose);
            }
            throw exception;
        }
    }

    private String readCompose(Path composePath) {
        try {
            return Files.exists(composePath) ? Files.readString(composePath) : null;
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not read the existing Compose file before applying settings.", exception);
        }
    }

    private void restoreCompose(Path composePath, String previousCompose) {
        if (previousCompose == null) {
            return;
        }
        try {
            Files.writeString(composePath, previousCompose);
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not restore the previous Compose file after a failed settings change.", exception);
        }
    }

    public AppActionResult enablePrivateAccess(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "enable private access for");
        AppRuntimeView view = refresh(app);
        String accessUrl = firstPresent(view.accessUrl(), view.settings() == null ? null : view.settings().accessUrl(), app.accessUrl());
        Integer localPort = runtimeStatusResolver.portFromUrl(accessUrl);
        if (localPort == null) {
            throw new InstallationException("Autark-OS could not find a local browser port for " + app.appName() + ".");
        }

        int privateHttpsPort = AppPrivateAccessPorts.selectHttpsPort(app.appId(), localPort, repository);
        TailscaleServeResult serveResult = tailscaleService.serveHttps(localPort, privateHttpsPort);
        if (!serveResult.configured()) {
            repository.recordEvent(app.appId(), "private_access_failed", serveResult.message());
            activityWarning("private_access_failed", "Private link failed for " + app.appName(), serveResult.message(), app.appId());
            throw new InstallationException(serveResult.message());
        }

        InstallModels.InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(accessUrl));
        InstallModels.InstallSettings updated = new InstallModels.InstallSettings(
                accessUrl,
                serveResult.privateUrl(),
                true,
                current.storageSubfolders(),
                current.backup(),
                "private",
                firstPresent(current.privateAccessRequirement(), "optional"),
                localPort,
                "http",
                current.lastAccessCheckAt(),
                current.lastSuccessfulAccessAt(),
                Instant.now(),
                "private_access_enabled",
                current.autoRepairEnabled());
        repository.saveSettings(app.appId(), updated);
        repository.recordEvent(app.appId(), "private_access_enabled", "Created private HTTPS link " + serveResult.privateUrl() + " for " + app.appName() + ".");
        activitySuccess("private_access_enabled", "Private link ready for " + app.appName(), "Created private HTTPS link " + serveResult.privateUrl() + ".", app.appId());
        return new AppActionResult(app.appId(), "private-access", "completed", app.appName() + " is available privately at " + serveResult.privateUrl() + ".", refresh(app), serveResult.output(), Instant.now());
    }

    public AppActionResult disablePrivateAccess(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "disable private access for");
        InstallModels.InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(app.accessUrl()));
        TailscaleServeResult disableResult = disablePrivateAccessMapping(app, current);
        InstallModels.InstallSettings updated = new InstallModels.InstallSettings(
                firstPresent(current.accessUrl(), app.accessUrl()),
                null,
                false,
                current.storageSubfolders(),
                current.backup(),
                "local",
                "disabled",
                current.expectedLocalPort(),
                current.expectedProtocol(),
                current.lastAccessCheckAt(),
                current.lastSuccessfulAccessAt(),
                Instant.now(),
                "private_access_disabled",
                current.autoRepairEnabled());
        repository.saveSettings(app.appId(), updated);
        repository.recordEvent(app.appId(), "private_access_disabled", "Removed private HTTPS link for " + app.appName() + ".");
        activitySuccess("private_access_disabled", "Private link removed for " + app.appName(), "Autark-OS turned off private access for this app.", app.appId());
        return new AppActionResult(app.appId(), "private-access-disable", "completed", app.appName() + " is no longer available through a private Tailscale link.", refresh(app), disableResult.output(), Instant.now());
    }

    private TailscaleServeResult disablePrivateAccessMapping(InstalledApp app, InstallModels.InstallSettings settings) {
        String localUrl = firstPresent(settings.accessUrl(), app.accessUrl());
        Integer port = privateAccessStateResolver.resolve(app.appId(), settings, localUrl).expectedHttpsPort();
        if (port == null) {
            return new TailscaleServeResult(true, settings.privateAccessUrl(), "No private HTTPS port was stored for this app.", List.of("No private HTTPS port was stored for this app."));
        }
        TailscaleServeResult result = tailscaleService.disableHttps(port);
        if (!result.configured()) {
            repository.recordEvent(app.appId(), "private_access_disable_failed", result.message());
            activityWarning("private_access_disable_failed", "Private link removal failed for " + app.appName(), result.message(), app.appId());
            throw new InstallationException(result.message());
        }
        return result;
    }

    private boolean shouldRepairPrivateAccess(AppHealthSnapshot snapshot) {
        return List.of("unreachable", "missing", "mismatched", "port_conflict", "unknown").contains(snapshot.privateAccessStatus());
    }

    private String repairMessage(InstalledApp app, AppHealthSnapshot before, AppHealthSnapshot after, boolean privateAccessRepaired) {
        if (privateAccessRepaired) {
            return "Autark-OS repaired the private network link for " + app.appName() + ".";
        }
        if (AutarkOsStates.AppStatus.READY.equals(after.status())) {
            return "Autark-OS repaired " + app.appName() + ". It is ready now.";
        }
        if (AutarkOsStates.AppStatus.STARTING.equals(after.status())) {
            return "Autark-OS repaired " + app.appName() + " and it is starting now.";
        }
        if (before.status().equals(after.status())) {
            return "Autark-OS tried to repair " + app.appName() + ", but it still needs attention.";
        }
        return "Autark-OS moved " + app.appName() + " from " + before.status() + " to " + after.status() + ".";
    }

    private String repairPlanLabel(AppHealthSnapshot snapshot) {
        if (shouldRepairPrivateAccess(snapshot)) {
            return "It is recreating the private HTTPS link.";
        }
        if (AutarkOsStates.AppStatus.PAUSED.equals(snapshot.status())) {
            return "It is starting the app containers.";
        }
        return "It is restarting the app containers and checking again.";
    }

    private String failureReason(RuntimeException exception) {
        return firstPresent(exception.getMessage(), "Repair failed before Autark-OS could read a reason.");
    }

    private String failureReason(List<String> output) {
        String reason = output == null ? "" : String.join("\n", output).trim();
        return firstPresent(reason, "The repair command failed without returning details.");
    }

    private void saveRepairState(InstalledApp app, String status) {
        InstallModels.InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(app.accessUrl()));
        repository.saveSettings(app.appId(), new InstallModels.InstallSettings(
                current.accessUrl(),
                current.privateAccessUrl(),
                current.tailscaleEnabled(),
                current.storageSubfolders(),
                current.backup(),
                current.desiredAccessMode(),
                current.privateAccessRequirement(),
                current.expectedLocalPort(),
                current.expectedProtocol(),
                current.lastAccessCheckAt(),
                current.lastSuccessfulAccessAt(),
                Instant.now(),
                status,
                current.autoRepairEnabled()));
    }

    public InstallModels.UninstallPlan uninstallPlan(String appId) {
        InstalledApp app = installedApp(appId);
        return uninstallService.uninstallPlan(app);
    }

    public AppActionResult uninstall(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "uninstall");
        InstallModels.InstallSettings settings = repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(app.accessUrl()));
        return uninstallService.uninstall(app, settings, composeFile(app));
    }

    private AppRuntimeView refresh(InstalledApp app) {
        return refresh(app, false);
    }

    private AppRuntimeView refresh(InstalledApp app, boolean includeTelemetry) {
        app = reconcileRuntimeMetadata(app);
        List<RuntimeModels.DockerContainerStatus> containers = composeExecutor.containersForApp(composeFile(app), app.composeProject(), app.appId());
        AppRuntimeStatus status = runtimeStatusResolver.normalize(containers);
        repository.updateStatus(app.appId(), status.friendlyStatus());
        ApplicationManifest manifest = catalogService.findById(app.appId()).orElse(null);
        String category = manifest == null ? "Installed" : manifest.category();
        String description = manifest == null ? "Managed by Autark-OS." : manifest.description();
        String version = manifest == null ? "Unknown" : manifest.version();
        String image = manifest == null ? null : manifest.image();
        List<com.autarkos.marketplace.model.ConfigurationItem> appConfiguration = manifest == null || manifest.configuration() == null ? List.of() : manifest.configuration();
        String accessUrl = runtimeStatusResolver.accessUrl(app, manifest, containers);
        InstallModels.InstallSettings settings = settingsPolicy.normalizeSettings(repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(accessUrl)), app, manifest, accessUrl);
        RuntimeModels.AppTelemetry telemetry = includeTelemetry ? telemetry(containers) : RuntimeModels.AppTelemetry.unavailable();
        if (accessUrl != null && !accessUrl.equals(app.accessUrl())) {
            repository.save(new InstalledApp(
                    app.appId(),
                    app.appName(),
                    status.friendlyStatus(),
                    app.runtimePath(),
                    app.composeProject(),
                    accessUrl,
                    app.installedAt()));
        }
        if (accessUrl != null && !accessUrl.equals(settings.accessUrl())) {
            settings = settingsPolicy.normalizeSettings(new InstallModels.InstallSettings(
                    accessUrl,
                    settings.privateAccessUrl(),
                    settings.tailscaleEnabled(),
                    settings.storageSubfolders(),
                    settings.backup(),
                    settings.desiredAccessMode(),
                    settings.privateAccessRequirement(),
                    settings.expectedLocalPort(),
                    settings.expectedProtocol(),
                    settings.lastAccessCheckAt(),
                    settings.lastSuccessfulAccessAt(),
                    settings.lastRepairAttemptAt(),
                    settings.lastRepairStatus(),
                    settings.autoRepairEnabled()), app, manifest, accessUrl);
            repository.saveSettings(app.appId(), settings);
        }
        PrivateAccessState privateAccess = privateAccessStateResolver.resolve(app.appId(), settings, accessUrl);
        String verifiedPrivateUrl = privateAccess.verifiedPrivateUrl();
        GuideModels.PostInstallGuide usageGuide = usageGuide(manifest, accessUrl, verifiedPrivateUrl);
        GuideModels.AppSetupGuide setupGuide = setupGuide(manifest, accessUrl, verifiedPrivateUrl);
        AccessModels.AccessDesiredState desiredAccess = settingsPolicy.desiredAccessState(settings, manifest, accessUrl, privateAccess);
        AccessModels.AccessObservedState observedAccess = settingsPolicy.observedAccessState(settings, accessUrl, privateAccess);
        AccessModels.AppAccessRoute accessRoute = settingsPolicy.accessRoute(settings, accessUrl, observedAccess, privateAccess);
        AppHealthSnapshot healthSnapshot = repository.healthFor(app.appId()).orElse(null);
        String remediationStatus = healthSnapshot == null ? status.friendlyStatus() : healthSnapshot.status();
        String backupState = backupState(app.appId(), settings);
        ReliabilityModels.AppRemediationView remediation = AppRemediationPolicy.remediation(
                app.appName(),
                remediationStatus,
                settings.lastRepairStatus(),
                settings.autoRepairEnabled(),
                AutarkOsStates.BackupState.PROTECTED_BY_RESTORE_POINT.equals(backupState),
                isRepairAvailable(remediationStatus));
        return new AppRuntimeView(
                app.appId(),
                app.appName(),
                category,
                description,
                version,
                image,
                status.friendlyStatus(),
                status.technicalStatus(),
                status.healthCheck(),
                app.runtimePath(),
                app.composeProject(),
                accessUrl,
                accessRoute,
                desiredAccess,
                observedAccess,
                app.installedAt(),
                settings.backup().enabled() ? settings.backup().label() : "Backups disabled",
                backupState,
                settings,
                telemetry,
                healthSnapshot,
                usageGuide,
                setupGuide,
                appConfiguration,
                remediation,
                repository.eventsFor(app.appId(), EVENT_LIMIT));
    }

    private String backupState(String appId, InstallModels.InstallSettings settings) {
        if (settings == null || settings.backup() == null || !settings.backup().enabled()) {
            return AutarkOsStates.BackupState.DISABLED;
        }
        boolean hasVerifiedRestorePoint = backupRepository.forApp(appId, 10).stream()
                .map(RestorePoints::toDomain)
                .anyMatch(BackupProtectionPolicy::isProtected);
        return hasVerifiedRestorePoint ? AutarkOsStates.BackupState.PROTECTED_BY_RESTORE_POINT : AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT;
    }

    private boolean isRepairAvailable(String status) {
        return AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(status) || AutarkOsStates.AppStatus.UNAVAILABLE.equals(status) || AutarkOsStates.AppStatus.MISSING.equals(status) || AutarkOsStates.AppStatus.PAUSED.equals(status);
    }

    private GuideModels.PostInstallGuide usageGuide(ApplicationManifest manifest, String accessUrl, String privateAccessUrl) {
        if (manifest == null) {
            return null;
        }
        return postInstallGuideBuilder.build(manifest, accessUrl, privateAccessUrl, installedProvisioningValues(manifest));
    }

    private GuideModels.AppSetupGuide setupGuide(ApplicationManifest manifest, String accessUrl, String privateAccessUrl) {
        if (manifest == null) {
            return null;
        }
        return postInstallGuideBuilder.buildSetupGuide(
                manifest,
                accessUrl,
                privateAccessUrl,
                installedProvisioningValues(manifest),
                managedInstalledApps().stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.toSet()));
    }

    private GuideModels.PostInstallProvisioningResult installedProvisioningValues(ApplicationManifest manifest) {
        if (!"obsidian-livesync".equals(manifest.id())) {
            return GuideModels.PostInstallProvisioningResult.empty();
        }
        Map<String, String> environment = new LinkedHashMap<>();
        for (String entry : manifest.runtime().environment()) {
            String[] parts = entry.split("=", 2);
            if (parts.length == 2) {
                environment.put(parts[0], parts[1]);
            }
        }
        return new GuideModels.PostInstallProvisioningResult(
                List.of(),
                List.of(),
                Map.of(
                        "username", environment.getOrDefault("COUCHDB_USER", "autarkos"),
                        "password", environment.getOrDefault("COUCHDB_PASSWORD", ""),
                        "database", "obsidian"));
    }

    private RuntimeModels.AppTelemetry telemetry(List<RuntimeModels.DockerContainerStatus> containers) {
        return appTelemetryService.telemetryForContainers(containers);
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private InstalledApp reconcileRuntimeMetadata(InstalledApp app) {
        return appRuntimeMetadataReader.read(Path.of(app.runtimePath()))
                .filter(metadata -> app.appId().equals(metadata.catalogAppId()))
                .map(metadata -> reconcileRuntimeMetadata(app, metadata))
                .orElse(app);
    }

    private InstalledApp reconcileRuntimeMetadata(InstalledApp app, RuntimeModels.AppRuntimeMetadata metadata) {
        String composeProject = firstPresent(metadata.composeProject(), app.composeProject());
        InstalledApp reconciled = app;
        if (!composeProject.equals(app.composeProject())) {
            reconciled = new InstalledApp(
                    app.appId(),
                    app.appName(),
                    app.status(),
                    app.runtimePath(),
                    composeProject,
                    app.accessUrl(),
                    app.installedAt());
            repository.save(reconciled);
        }

        RuntimeModels.InstalledAppOwnershipMetadata current = repository.ownershipFor(app.appId()).orElse(null);
        if (current == null) {
            return reconciled;
        }
        String appInstanceId = firstPresent(metadata.appInstanceId(), current.appInstanceId());
        String autarkOsInstanceId = firstPresent(metadata.instanceId(), current.autarkOsInstanceId());
        if (!Objects.equals(appInstanceId, current.appInstanceId())
                || !Objects.equals(autarkOsInstanceId, current.autarkOsInstanceId())
                || !Objects.equals(app.runtimePath(), current.runtimePathOrHash())) {
            repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                    app.appId(),
                    appInstanceId,
                    app.appId(),
                    autarkOsInstanceId,
                    app.runtimePath(),
                    firstPresent(current.installState(), "ready"),
                    firstPresent(current.ownershipStatus(), "owned"),
                    current.createdAt(),
                    Instant.now()));
        }
        return reconciled;
    }

    private InstalledApp installedApp(String appId) {
        return repository.findAppById(appId)
                .orElseThrow(() -> new InstallationException("Autark-OS is not managing an app with id " + appId + "."));
    }

    private List<InstalledApp> managedInstalledApps() {
        return repository.findAllApps().stream()
                .filter(this::ownedByThisAutarkOs)
                .toList();
    }

    private boolean ownedByThisAutarkOs(InstalledApp app) {
        return repository.ownershipFor(app.appId())
                .filter(metadata -> "owned".equalsIgnoreCase(metadata.ownershipStatus()))
                .filter(metadata -> metadata.appInstanceId() != null && !metadata.appInstanceId().isBlank())
                .filter(metadata -> metadata.autarkOsInstanceId() != null && !metadata.autarkOsInstanceId().isBlank())
                .isPresent();
    }

    private void assertLifecycleEligible(InstalledApp app, String action) {
        RuntimeModels.InstalledAppOwnershipMetadata metadata = repository.ownershipFor(app.appId())
                .orElseThrow(() -> new InstallationException(app.appName() + " is not owned by this Autark-OS instance, so Autark-OS will not " + action + " it automatically."));
        if (!"owned".equalsIgnoreCase(metadata.ownershipStatus())) {
            throw new InstallationException(app.appName() + " is not owned by this Autark-OS instance, so Autark-OS will not " + action + " it automatically.");
        }
        if (metadata.appInstanceId() == null || metadata.appInstanceId().isBlank()
                || metadata.autarkOsInstanceId() == null || metadata.autarkOsInstanceId().isBlank()) {
            throw new InstallationException(app.appName() + " has incomplete Autark-OS ownership metadata, so Autark-OS will not " + action + " it automatically.");
        }
    }

    private void assertComposeAvailable(InstalledApp app, String action) {
        if (!AppRuntimeFiles.isComposeFile(composeFile(app))) {
            throw new InstallationException(
                    app.appName() + " cannot " + action + " because its original Compose file is missing. "
                            + "You can still stop it or use the reviewed uninstall plan to save a recovery archive before cleanup.");
        }
    }

    private void activityInfo(String action, String title, String message, String appId) {
        if (activityLogService != null) {
            activityLogService.info("applications", action, title, message, appId);
        }
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

    private void activityError(String action, String title, String message, String appId, RuntimeException exception) {
        if (activityLogService != null) {
            activityLogService.error("applications", action, title, message, appId, exception);
        }
    }

    private Path composeFile(InstalledApp app) {
        return Path.of(app.runtimePath()).resolve("compose.yaml");
    }

}
