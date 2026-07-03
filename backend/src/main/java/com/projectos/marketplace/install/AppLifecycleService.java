package com.projectos.marketplace.install;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.projectos.activity.ActivityLogService;
import com.projectos.backups.BackupRepository;
import com.projectos.marketplace.api.InstallOptionsRequest;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.model.AccessManifest;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.marketplace.model.HealthManifest;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.network.tailscale.TailscaleServeResult;
import com.projectos.network.tailscale.TailscaleService;

@Service
public class AppLifecycleService {

    private static final int EVENT_LIMIT = 8;
    private static final Duration ACCESS_CHECK_TIMEOUT = Duration.ofMillis(850);
    private static final Pattern SAFE_STORAGE_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,63}");
    private static final Pattern HOST_PORT_CONFLICT = Pattern.compile("host port [^:]*:(\\d+)/tcp: address already in use", Pattern.CASE_INSENSITIVE);
    private static final Set<String> BACKUP_FREQUENCIES = Set.of("hourly", "daily", "weekly");
    private static final DateTimeFormatter SAFETY_CHECKPOINT_NAME_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final InstalledAppRepository repository;
    private final DockerComposeExecutor composeExecutor;
    private final MarketplaceCatalogService catalogService;
    private final ManagedContainerDiscovery managedContainerDiscovery;
    private final RuntimeLayout runtimeLayout;
    private final PostInstallGuideBuilder postInstallGuideBuilder;
    private final TailscaleService tailscaleService;
    private final boolean devMode;
    private final ActivityLogService activityLogService;
    private final BackupRepository backupRepository;
    private final AppTelemetryService appTelemetryService;
    private final AppRuntimeMetadataReader appRuntimeMetadataReader = new AppRuntimeMetadataReader();
    private final AppRuntimeStatusResolver runtimeStatusResolver = new AppRuntimeStatusResolver();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(ACCESS_CHECK_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    @Autowired
    public AppLifecycleService(InstalledAppRepository repository, DockerComposeExecutor composeExecutor, MarketplaceCatalogService catalogService, ManagedContainerDiscovery managedContainerDiscovery, RuntimeLayout runtimeLayout, PostInstallGuideBuilder postInstallGuideBuilder, TailscaleService tailscaleService, @Value("${project-os.dev-mode:false}") boolean devMode, ActivityLogService activityLogService, BackupRepository backupRepository, AppTelemetryService appTelemetryService) {
        this.repository = repository;
        this.composeExecutor = composeExecutor;
        this.catalogService = catalogService;
        this.managedContainerDiscovery = managedContainerDiscovery;
        this.runtimeLayout = runtimeLayout;
        this.postInstallGuideBuilder = postInstallGuideBuilder;
        this.tailscaleService = tailscaleService;
        this.devMode = devMode;
        this.activityLogService = activityLogService;
        this.backupRepository = backupRepository;
        this.appTelemetryService = appTelemetryService;
    }

    public AppLifecycleService(InstalledAppRepository repository, DockerComposeExecutor composeExecutor, MarketplaceCatalogService catalogService, ManagedContainerDiscovery managedContainerDiscovery, RuntimeLayout runtimeLayout, PostInstallGuideBuilder postInstallGuideBuilder, TailscaleService tailscaleService, @Value("${project-os.dev-mode:false}") boolean devMode, ActivityLogService activityLogService, BackupRepository backupRepository) {
        this(repository, composeExecutor, catalogService, managedContainerDiscovery, runtimeLayout, postInstallGuideBuilder, tailscaleService, devMode, activityLogService, backupRepository, new AppTelemetryService(composeExecutor));
    }

    public AppLifecycleService(InstalledAppRepository repository, DockerComposeExecutor composeExecutor, MarketplaceCatalogService catalogService, ManagedContainerDiscovery managedContainerDiscovery, RuntimeLayout runtimeLayout, PostInstallGuideBuilder postInstallGuideBuilder, TailscaleService tailscaleService, @Value("${project-os.dev-mode:false}") boolean devMode, ActivityLogService activityLogService) {
        this(repository, composeExecutor, catalogService, managedContainerDiscovery, runtimeLayout, postInstallGuideBuilder, tailscaleService, devMode, activityLogService, new BackupRepository(runtimeLayout));
    }

    public AppLifecycleService(InstalledAppRepository repository, DockerComposeExecutor composeExecutor, MarketplaceCatalogService catalogService, ManagedContainerDiscovery managedContainerDiscovery, RuntimeLayout runtimeLayout, PostInstallGuideBuilder postInstallGuideBuilder, TailscaleService tailscaleService, @Value("${project-os.dev-mode:false}") boolean devMode) {
        this(repository, composeExecutor, catalogService, managedContainerDiscovery, runtimeLayout, postInstallGuideBuilder, tailscaleService, devMode, null);
    }

    public AppLifecycleService(InstalledAppRepository repository, DockerComposeExecutor composeExecutor, MarketplaceCatalogService catalogService, ManagedContainerDiscovery managedContainerDiscovery, RuntimeLayout runtimeLayout, PostInstallGuideBuilder postInstallGuideBuilder, TailscaleService tailscaleService) {
        this(repository, composeExecutor, catalogService, managedContainerDiscovery, runtimeLayout, postInstallGuideBuilder, tailscaleService, false, null);
    }

    public List<AppRuntimeView> listApps() {
        return managedInstalledApps().stream()
                .map(this::refresh)
                .toList();
    }

    public AppRuntimeView getApp(String appId) {
        return refresh(installedApp(appId));
    }

    public AppTelemetry telemetry(String appId) {
        return appTelemetryService.telemetry(installedApp(appId));
    }

    public Map<String, AppTelemetry> telemetry() {
        return appTelemetryService.telemetryForApps(managedInstalledApps());
    }

    public Map<String, AppAccessCheck> accessChecks() {
        Map<String, AppAccessCheck> checks = new LinkedHashMap<>();
        for (InstalledApp app : managedInstalledApps()) {
            String accessUrl = repository.settingsFor(app.appId())
                    .map(InstallSettings::accessUrl)
                    .filter(url -> url != null && !url.isBlank())
                    .orElse(app.accessUrl());
            checks.put(app.appId(), accessCheck(app.appId(), accessUrl));
        }
        return checks;
    }

    public Map<String, AppHealthSnapshot> healthSnapshots() {
        Map<String, AppHealthSnapshot> snapshots = new LinkedHashMap<>();
        for (InstalledApp app : managedInstalledApps()) {
            AppHealthSnapshot snapshot = healthSnapshot(app);
            snapshots.put(app.appId(), snapshot);
        }
        return snapshots;
    }

    public AppReliabilitySummary reliabilitySummary() {
        List<InstalledApp> apps = managedInstalledApps();
        Instant checkedAt = Instant.now();
        int ready = countByStatus(apps, "Ready");
        int starting = countByStatus(apps, "Starting");
        int paused = countByStatus(apps, "Paused");
        int needsAttention = countByStatus(apps, "Needs attention");
        int unavailable = countByStatus(apps, "Unavailable");
        List<AppReliabilityIssue> issues = apps.stream()
                .filter(this::hasReliabilityIssue)
                .map(this::reliabilityIssue)
                .toList();
        List<AppReliabilityActivity> allActivity = apps.stream()
                .flatMap(app -> repository.eventsFor(app.appId(), 20).stream().filter(this::isReliabilityEvent).map(event -> reliabilityActivity(app, event)))
                .sorted((left, right) -> right.createdAt().compareTo(left.createdAt()))
                .toList();
        Instant recentWindow = checkedAt.minus(Duration.ofHours(24));
        int successfulRepairs = (int) allActivity.stream()
                .filter(item -> item.createdAt().isAfter(recentWindow))
                .filter(item -> "success".equals(item.tone()))
                .count();
        int failedRepairs = (int) allActivity.stream()
                .filter(item -> item.createdAt().isAfter(recentWindow))
                .filter(item -> "danger".equals(item.tone()))
                .count();
        List<AppReliabilityActivity> activity = allActivity.stream()
                .limit(10)
                .toList();
        String posture = issues.isEmpty() ? "healthy" : unavailable > 0 ? "critical" : "warning";
        return new AppReliabilitySummary(
                posture,
                reliabilityHeadline(posture),
                reliabilitySummaryText(posture, issues.size(), successfulRepairs, failedRepairs),
                apps.size(),
                ready,
                starting,
                paused,
                needsAttention,
                unavailable,
                (int) apps.stream().filter(app -> settingsFor(app).tailscaleEnabled()).count(),
                (int) apps.stream().filter(app -> settingsFor(app).autoRepairEnabled()).count(),
                successfulRepairs,
                failedRepairs,
                issues,
                activity,
                checkedAt);
    }

    public AppHealthSnapshot healthSnapshot(String appId) {
        return healthSnapshot(installedApp(appId));
    }

    private int countByStatus(List<InstalledApp> apps, String status) {
        return (int) apps.stream().filter(app -> status.equals(displayHealthStatus(app))).count();
    }

    private boolean hasReliabilityIssue(InstalledApp app) {
        String status = displayHealthStatus(app);
        return "Needs attention".equals(status)
                || "Unavailable".equals(status)
                || privateLinkMissing(app);
    }

    private AppReliabilityIssue reliabilityIssue(InstalledApp app) {
        AppHealthSnapshot health = repository.healthFor(app.appId()).orElse(null);
        String status = displayHealthStatus(app);
        boolean privateMissing = privateLinkMissing(app);
        String message = privateMissing ? "Private link is missing" : health == null ? "Waiting for health check" : health.message();
        String detail = privateMissing ? "Project OS expects a private link for this app, but Tailscale Serve does not currently have one configured." : health == null ? "Project OS has not recorded a health check for this app yet." : health.detail();
        String action = privateMissing ? "Repair private link" : "Try to fix";
        return new AppReliabilityIssue(
                app.appId(),
                app.appName(),
                status,
                message,
                detail,
                action,
                !"Paused".equals(status),
                health == null ? Instant.now() : health.checkedAt());
    }

    private String displayHealthStatus(InstalledApp app) {
        AppHealthSnapshot health = repository.healthFor(app.appId()).orElse(null);
        if (health != null && health.status() != null) {
            return health.status();
        }
        return switch (app.status()) {
            case "Ready", "Starting", "Needs attention", "Unavailable", "Paused" -> app.status();
            case "Stopped" -> "Paused";
            case "Installed" -> "Ready";
            default -> "Starting";
        };
    }

    private boolean privateLinkMissing(InstalledApp app) {
        InstallSettings settings = settingsFor(app);
        return settings.tailscaleEnabled() && (settings.privateAccessUrl() == null || settings.privateAccessUrl().isBlank());
    }

    private InstallSettings settingsFor(InstalledApp app) {
        return repository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(app.accessUrl()));
    }

    private boolean isReliabilityEvent(AppEvent event) {
        return event.type().startsWith("guardian_")
                || event.type().contains("repair")
                || event.type().contains("health")
                || event.type().contains("private_access");
    }

    private AppReliabilityActivity reliabilityActivity(InstalledApp app, AppEvent event) {
        return new AppReliabilityActivity(
                event.id(),
                app.appId(),
                app.appName(),
                event.type(),
                event.message(),
                eventTone(event),
                event.createdAt());
    }

    private String eventTone(AppEvent event) {
        if (event.type().contains("failed")) {
            return "danger";
        }
        if (event.type().contains("completed") || event.type().equals("private_access_enabled")) {
            return "success";
        }
        if (event.type().contains("detected") || event.type().contains("started") || event.type().contains("health_changed")) {
            return "warning";
        }
        return "neutral";
    }

    private String reliabilityHeadline(String posture) {
        return switch (posture) {
            case "healthy" -> "Apps are stable";
            case "critical" -> "Some apps need help";
            default -> "Stability needs a quick review";
        };
    }

    private String reliabilitySummaryText(String posture, int issueCount, int successfulRepairs, int failedRepairs) {
        if ("healthy".equals(posture)) {
            return successfulRepairs > 0
                    ? "Project OS recently fixed issues and no apps currently need attention."
                    : "No app stability issues are currently reported.";
        }
        if (failedRepairs > 0) {
            return "Project OS found " + issueCount + " issue(s), and at least one repair needs your review.";
        }
        return "Project OS found " + issueCount + " issue(s) and will try safe fixes when automatic repair is enabled.";
    }

    public AppActionResult start(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "start");
        DockerComposeResult result = composeExecutor.up(composeFile(app), app.composeProject());
        return completeAction(app, "start", result, "Starting " + app.appName(), "Could not start " + app.appName());
    }

    public AppActionResult stop(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "stop");
        DockerComposeResult result = composeExecutor.stop(composeFile(app), app.composeProject());
        return completeAction(app, "stop", result, "Stopped " + app.appName(), "Could not stop " + app.appName());
    }

    public AppActionResult restart(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "restart");
        DockerComposeResult result = composeExecutor.restart(composeFile(app), app.composeProject());
        return completeAction(app, "restart", result, "Restarted " + app.appName(), "Could not restart " + app.appName());
    }

    public AppActionResult repair(String appId) {
        return repair(appId, false);
    }

    AppActionResult repair(String appId, boolean automatic) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "repair");
        AppHealthSnapshot before = healthSnapshot(app);
        List<String> logs = new java.util.ArrayList<>();
        logs.add("Before repair: " + before.status() + " - " + before.message());
        String eventPrefix = automatic ? "guardian_" : "";

        if ("Ready".equals(before.status())) {
            saveRepairState(app, automatic ? "guardian_skipped_ready" : "manual_skipped_ready");
            repository.recordEvent(app.appId(), eventPrefix + "repair_skipped", app.appName() + " already looked ready.");
            activityInfo(eventPrefix + "repair_skipped", "Repair skipped for " + app.appName(), app.appName() + " already looks ready.", app.appId());
            return new AppActionResult(app.appId(), "repair", "skipped", app.appName() + " already looks ready. No repair was needed.", refresh(app), logs, Instant.now());
        }

        saveRepairState(app, automatic ? "guardian_repair_running" : "manual_repair_running");
        repository.recordEvent(app.appId(), eventPrefix + "repair_started", "Project OS noticed: " + before.message() + ". " + repairPlanLabel(before));
        activityWarning(eventPrefix + "repair_started", "Repair started for " + app.appName(), before.message() + ". " + repairPlanLabel(before), app.appId());
        boolean repairingPrivateAccess = shouldRepairPrivateAccess(before);
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
        } else if ("Paused".equals(before.status())) {
            DockerComposeResult result = composeExecutor.up(composeFile(app), app.composeProject());
            logs.addAll(result.output());
            if (!result.successful()) {
                saveRepairState(app, automatic ? "guardian_repair_failed" : "manual_repair_failed");
                repository.recordEvent(app.appId(), eventPrefix + "repair_failed", failureReason(result.output()));
                activityWarning(eventPrefix + "repair_failed", "Repair failed for " + app.appName(), failureReason(result.output()), app.appId());
                throw new InstallationException("Project OS could not start " + app.appName() + ". Check recent activity for details.");
            }
            repository.recordEvent(app.appId(), eventPrefix + "repair_step_completed", "Started " + app.appName() + " as part of repair.");
        } else {
            DockerComposeResult result = composeExecutor.restart(composeFile(app), app.composeProject());
            logs.addAll(result.output());
            if (!result.successful()) {
                saveRepairState(app, automatic ? "guardian_repair_failed" : "manual_repair_failed");
                repository.recordEvent(app.appId(), eventPrefix + "repair_failed", failureReason(result.output()));
                activityWarning(eventPrefix + "repair_failed", "Repair failed for " + app.appName(), failureReason(result.output()), app.appId());
                throw new InstallationException("Project OS could not restart " + app.appName() + ". Check recent activity for details.");
            }
            repository.recordEvent(app.appId(), eventPrefix + "repair_step_completed", "Restarted " + app.appName() + " as part of repair.");
        }

        AppHealthSnapshot after = healthSnapshot(app);
        logs.add("After repair: " + after.status() + " - " + after.message());
        boolean privateAccessRepaired = repairingPrivateAccess && "reachable".equals(after.privateAccessStatus());
        String status = "Ready".equals(after.status()) || "Starting".equals(after.status()) || privateAccessRepaired ? "completed" : "needs_attention";
        String message = repairMessage(app, before, after, privateAccessRepaired);
        saveRepairState(app, automatic ? "guardian_repair_" + status : "manual_repair_" + status);
        repository.recordEvent(app.appId(), eventPrefix + "repair_completed", message);
        if ("completed".equals(status)) {
            activitySuccess(eventPrefix + "repair_completed", "Repair completed for " + app.appName(), message, app.appId());
        } else {
            activityWarning(eventPrefix + "repair_needs_attention", "Repair still needs attention for " + app.appName(), message, app.appId());
        }
        return new AppActionResult(app.appId(), "repair", status, message, refresh(app), logs, Instant.now());
    }

    public AppRuntimeView updateSettings(String appId, InstallSettings settings) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "update settings for");
        String defaultAccessUrl = app.accessUrl();
        InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(defaultAccessUrl));
        InstallSettings sanitized = sanitize(settings, app);
        AppSettingsChangePlan plan = settingsChangePlan(app, current, sanitized);
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
            sanitized = new InstallSettings(
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
            activitySuccess("private_access_disabled", "Private link removed for " + app.appName(), "Project OS turned off private access for this app.", app.appId());
        } else if (!sanitized.tailscaleEnabled() && sanitized.privateAccessUrl() != null) {
            sanitized = new InstallSettings(
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

    public AppSettingsChangePlan settingsChangePlan(String appId, InstallSettings settings) {
        InstalledApp app = installedApp(appId);
        InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(app.accessUrl()));
        return settingsChangePlan(app, current, sanitize(settings, app));
    }

    private AppSettingsChangePlan settingsChangePlan(InstalledApp app, InstallSettings current, InstallSettings requested) {
        List<String> changes = new java.util.ArrayList<>();
        List<String> warnings = new java.util.ArrayList<>();
        List<String> blocked = new java.util.ArrayList<>();
        boolean redeployRequired = false;
        boolean restartRequired = false;
        boolean dataMigrationRequired = false;

        Integer currentPort = current.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(firstPresent(current.accessUrl(), app.accessUrl())) : current.expectedLocalPort();
        Integer requestedPort = requested.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(requested.accessUrl()) : requested.expectedLocalPort();
        if (!same(current.accessUrl(), requested.accessUrl()) || !same(currentPort, requestedPort)) {
            changes.add("Local app address will change to " + requested.accessUrl() + ".");
            if (!same(currentPort, requestedPort)) {
                redeployRequired = true;
                warnings.add("Project OS will update the Compose file and restart the app containers so the new port is active.");
            }
        }
        if (!same(current.expectedProtocol(), requested.expectedProtocol())) {
            changes.add("Expected protocol will change to " + requested.expectedProtocol() + ".");
            restartRequired = true;
        }
        if (current.tailscaleEnabled() != requested.tailscaleEnabled()) {
            changes.add(requested.tailscaleEnabled() ? "Private access preference will be enabled." : "Private access preference will be disabled.");
            warnings.add("Private access is safest to manage from Network, where Project OS can repair and verify Tailscale links.");
        }
        if (!same(current.backup(), requested.backup())) {
            changes.add("Backup preference will be saved for this app.");
        }
        if (current.autoRepairEnabled() != requested.autoRepairEnabled()) {
            changes.add(requested.autoRepairEnabled() ? "Automatic fixes will be enabled." : "Automatic fixes will be disabled.");
        }
        if (!same(current.storageSubfolders(), requested.storageSubfolders())) {
            dataMigrationRequired = true;
            changes.add("Storage folder names were changed.");
            blocked.add("Storage folder changes need a guarded data migration. Project OS will not move app data from this modal yet.");
        }

        if (changes.isEmpty()) {
            changes.add("No settings changes detected.");
        }
        String impact;
        if (!blocked.isEmpty()) {
            impact = "manual";
        } else if (dataMigrationRequired) {
            impact = "data_migration_required";
        } else if (redeployRequired) {
            impact = "redeploy_required";
        } else if (restartRequired) {
            impact = "restart_required";
        } else {
            impact = "database_only";
        }
        String headline = switch (impact) {
            case "manual" -> "Needs manual attention";
            case "data_migration_required" -> "Data migration required";
            case "redeploy_required" -> "App restart required";
            case "restart_required" -> "Restart recommended";
            default -> "Safe to save";
        };
        String summary = switch (impact) {
            case "manual" -> "Project OS cannot safely apply one or more settings yet.";
            case "data_migration_required" -> "Project OS needs a migration step before changing storage folders.";
            case "redeploy_required" -> "Project OS will rewrite the Compose file and start the app with the new settings.";
            case "restart_required" -> "Project OS will save the setting and may need a restart before it is reflected.";
            default -> "Project OS will save these settings without restarting containers.";
        };
        return new AppSettingsChangePlan(
                app.appId(),
                app.appName(),
                impact,
                headline,
                summary,
                blocked.isEmpty(),
                redeployRequired,
                restartRequired,
                dataMigrationRequired,
                changes,
                warnings,
                blocked);
    }

    private void safeRedeployForSettings(InstalledApp app, InstallSettings settings) {
        ApplicationManifest manifest = catalogService.findById(app.appId())
                .orElseThrow(() -> new InstallationException("Project OS could not find the catalog template for " + app.appName() + "."));
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
            ResolvedRuntimeConfiguration runtimeConfiguration = new InstallCustomizationResolver(new PortAllocator()).resolve(manifest, options);
            new ComposeRenderer(runtimeLayout).render(manifest, appRoot, runtimeConfiguration);
            DockerComposeResult result = composeExecutor.up(composePath, app.composeProject());
            if (!result.successful()) {
                restoreCompose(composePath, previousCompose);
                restored = true;
                repository.recordEvent(app.appId(), "settings_redeploy_failed", failureReason(result.output()));
                activityWarning("settings_redeploy_failed", "Settings redeploy failed for " + app.appName(), failureReason(result.output()), app.appId());
                throw new InstallationException("Project OS could not restart " + app.appName() + " with the new settings. The previous Compose file was restored.");
            }
            repository.recordEvent(app.appId(), "settings_redeploy_completed", "Updated Compose and restarted " + app.appName() + ".");
            activitySuccess("settings_redeploy_completed", "Settings redeploy completed for " + app.appName(), "Project OS updated Compose and restarted the app.", app.appId());
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
            throw new InstallationException("Project OS could not read the existing Compose file before applying settings.", exception);
        }
    }

    private void restoreCompose(Path composePath, String previousCompose) {
        if (previousCompose == null) {
            return;
        }
        try {
            Files.writeString(composePath, previousCompose);
        } catch (IOException exception) {
            throw new InstallationException("Project OS could not restore the previous Compose file after a failed settings change.", exception);
        }
    }

    private boolean same(Object left, Object right) {
        return java.util.Objects.equals(left, right);
    }

    public AppActionResult enablePrivateAccess(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "enable private access for");
        AppRuntimeView view = refresh(app);
        String accessUrl = firstPresent(view.accessUrl(), view.settings() == null ? null : view.settings().accessUrl(), app.accessUrl());
        Integer localPort = runtimeStatusResolver.portFromUrl(accessUrl);
        if (localPort == null) {
            throw new InstallationException("Project OS could not find a local browser port for " + app.appName() + ".");
        }

        int privateHttpsPort = AppPrivateAccessPorts.selectHttpsPort(app.appId(), localPort, repository);
        TailscaleServeResult serveResult = tailscaleService.serveHttps(localPort, privateHttpsPort);
        if (!serveResult.configured()) {
            repository.recordEvent(app.appId(), "private_access_failed", serveResult.message());
            activityWarning("private_access_failed", "Private link failed for " + app.appName(), serveResult.message(), app.appId());
            throw new InstallationException(serveResult.message());
        }

        InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(accessUrl));
        InstallSettings updated = new InstallSettings(
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
        InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(app.accessUrl()));
        TailscaleServeResult disableResult = disablePrivateAccessMapping(app, current);
        InstallSettings updated = new InstallSettings(
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
        activitySuccess("private_access_disabled", "Private link removed for " + app.appName(), "Project OS turned off private access for this app.", app.appId());
        return new AppActionResult(app.appId(), "private-access-disable", "completed", app.appName() + " is no longer available through a private Tailscale link.", refresh(app), disableResult.output(), Instant.now());
    }

    private TailscaleServeResult disablePrivateAccessMapping(InstalledApp app, InstallSettings settings) {
        Integer port = runtimeStatusResolver.portFromUrl(settings.privateAccessUrl());
        if (port == null) {
            port = settings.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(firstPresent(settings.accessUrl(), app.accessUrl())) : settings.expectedLocalPort();
        }
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
        return "Private link is not responding".equals(snapshot.message())
                || "unreachable".equals(snapshot.privateAccessStatus())
                || "missing".equals(snapshot.privateAccessStatus());
    }

    private String repairMessage(InstalledApp app, AppHealthSnapshot before, AppHealthSnapshot after, boolean privateAccessRepaired) {
        if (privateAccessRepaired) {
            return "Project OS repaired the private network link for " + app.appName() + ".";
        }
        if ("Ready".equals(after.status())) {
            return "Project OS repaired " + app.appName() + ". It is ready now.";
        }
        if ("Starting".equals(after.status())) {
            return "Project OS repaired " + app.appName() + " and it is starting now.";
        }
        if (before.status().equals(after.status())) {
            return "Project OS tried to repair " + app.appName() + ", but it still needs attention.";
        }
        return "Project OS moved " + app.appName() + " from " + before.status() + " to " + after.status() + ".";
    }

    private String repairPlanLabel(AppHealthSnapshot snapshot) {
        if (shouldRepairPrivateAccess(snapshot)) {
            return "It is recreating the private HTTPS link.";
        }
        if ("Paused".equals(snapshot.status())) {
            return "It is starting the app containers.";
        }
        return "It is restarting the app containers and checking again.";
    }

    private String failureReason(RuntimeException exception) {
        return firstPresent(exception.getMessage(), "Repair failed before Project OS could read a reason.");
    }

    private String failureReason(List<String> output) {
        String reason = output == null ? "" : String.join("\n", output).trim();
        return firstPresent(reason, "The repair command failed without returning details.");
    }

    private void saveRepairState(InstalledApp app, String status) {
        InstallSettings current = repository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(app.accessUrl()));
        repository.saveSettings(app.appId(), new InstallSettings(
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

    public UninstallPlan uninstallPlan(String appId) {
        InstalledApp app = installedApp(appId);
        boolean checkpointPlanned = hasCheckpointableData(app);
        String checkpointMessage = checkpointPlanned
                ? "Project OS will save a safety checkpoint before removing containers. Your app data is still kept on disk."
                : "Project OS did not find app data to checkpoint. The remove step will still keep the app folder if it exists.";
        return new UninstallPlan(
                app.appId(),
                app.appName(),
                "Project-OS can remove the running app while keeping your data on disk.",
                checkpointPlanned,
                checkpointMessage,
                List.of("Create a safety checkpoint when app data is present", "Stop the app containers", "Remove the Compose project", "Hide the app from the managed Applications list"),
                List.of("Application data in " + app.runtimePath(), "Backups and files created outside Docker", "Historical activity events"),
                List.of("Confirm you understand that containers will be removed", "Delete data manually later if you no longer need it"));
    }

    public AppActionResult uninstall(String appId) {
        InstalledApp app = installedApp(appId);
        assertLifecycleEligible(app, "uninstall");
        InstallSettings settings = repository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(app.accessUrl()));
        List<String> logs = new java.util.ArrayList<>();
        SafetyCheckpointResult checkpoint = createPreUninstallCheckpoint(app);
        logs.addAll(checkpoint.logs());
        if (settings.tailscaleEnabled() || settings.privateAccessUrl() != null) {
            TailscaleServeResult disableResult = disablePrivateAccessMapping(app, settings);
            logs.addAll(disableResult.output());
        }
        DockerComposeResult result = composeExecutor.down(composeFile(app), app.composeProject());
        logs.addAll(result.output());
        if (result.successful()) {
            repository.recordEvent(app.appId(), "uninstalled", "Removed containers for " + app.appName() + "; data was kept on disk.");
            activitySuccess("uninstalled", "Uninstalled " + app.appName(), "Removed containers and kept app data on disk.", app.appId());
            repository.delete(app.appId());
            return new AppActionResult(app.appId(), "uninstall", "removed", app.appName() + " was removed from Project-OS. Data was kept on disk.", null, logs, Instant.now());
        }
        repository.recordEvent(app.appId(), "uninstall_failed", String.join("\n", result.output()));
        activityWarning("uninstall_failed", "Uninstall failed for " + app.appName(), failureReason(result.output()), app.appId());
        throw new InstallationException("Could not uninstall " + app.appName() + ". Check the recent activity for details.");
    }

    private SafetyCheckpointResult createPreUninstallCheckpoint(InstalledApp app) {
        Path source = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        if (!Files.isDirectory(source) || directorySize(source) == 0) {
            return new SafetyCheckpointResult(false, List.of("No app data found to checkpoint before uninstall."));
        }
        try {
            Path directory = backupRoot().resolve("pre-uninstall");
            Files.createDirectories(directory);
            Path destination = directory.resolve(app.appId() + "-pre-uninstall-" + SAFETY_CHECKPOINT_NAME_FORMAT.format(Instant.now()) + ".zip");
            long size = zipDirectory(source, destination);
            backupRepository.record(app.appId(), app.appName(), "app", "pre_uninstall", app.appId(), destination.toString(), "completed", size, "Safety checkpoint created before uninstall.");
            repository.recordEvent(app.appId(), "safety_checkpoint_created", "Saved a safety checkpoint before removing " + app.appName() + ".");
            activitySuccess("safety_checkpoint_created", "Saved safety checkpoint", "Project OS saved a checkpoint before removing " + app.appName() + ".", app.appId());
            return new SafetyCheckpointResult(true, List.of("Created safety checkpoint " + destination));
        } catch (IOException | RuntimeException exception) {
            String reason = exception.getMessage() == null || exception.getMessage().isBlank()
                    ? "No detailed reason was returned."
                    : exception.getMessage();
            String message = "Project OS could not create a safety checkpoint before uninstall: " + reason;
            repository.recordEvent(app.appId(), "safety_checkpoint_failed", message);
            activityWarning("safety_checkpoint_failed", "Safety checkpoint failed", message, app.appId());
            return new SafetyCheckpointResult(false, List.of(message));
        }
    }

    private AppActionResult completeAction(InstalledApp app, String action, DockerComposeResult result, String successMessage, String failureMessage) {
        if (result.successful()) {
            repository.recordEvent(app.appId(), action, successMessage + ".");
            activitySuccess(action, successMessage, successMessage + ".", app.appId());
            AppRuntimeView view = refresh(app);
            return new AppActionResult(app.appId(), action, "completed", successMessage + ".", view, result.output(), Instant.now());
        }
        repository.recordEvent(app.appId(), action + "_failed", String.join("\n", result.output()));
        activityWarning(action + "_failed", failureMessage, failureReason(result.output()), app.appId());
        throw new InstallationException(lifecycleFailureMessage(failureMessage, result.output()));
    }

    private String lifecycleFailureMessage(String fallbackMessage, List<String> output) {
        String outputText = output == null ? "" : String.join("\n", output);
        Matcher portConflict = HOST_PORT_CONFLICT.matcher(outputText);
        if (portConflict.find()) {
            return "Port " + portConflict.group(1) + " is already in use. Stop the service using that port or change the app port, then try again.";
        }
        return fallbackMessage + ". Check recent activity for details.";
    }

    private AppRuntimeView refresh(InstalledApp app) {
        return refresh(app, false);
    }

    private AppRuntimeView refresh(InstalledApp app, boolean includeTelemetry) {
        app = reconcileRuntimeMetadata(app);
        List<DockerContainerStatus> containers = composeExecutor.containers(composeFile(app), app.composeProject());
        AppRuntimeStatus status = runtimeStatusResolver.normalize(containers);
        repository.updateStatus(app.appId(), status.friendlyStatus());
        ApplicationManifest manifest = catalogService.findById(app.appId()).orElse(null);
        String category = manifest == null ? "Installed" : manifest.category();
        String description = manifest == null ? "Managed by Project-OS." : manifest.description();
        String version = manifest == null ? "Unknown" : manifest.version();
        String image = manifest == null ? null : manifest.image();
        List<com.projectos.marketplace.model.ConfigurationItem> appConfiguration = manifest == null || manifest.configuration() == null ? List.of() : manifest.configuration();
        String accessUrl = runtimeStatusResolver.accessUrl(app, manifest, containers);
        InstallSettings settings = normalizeSettings(repository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(accessUrl)), app, manifest, accessUrl);
        AppTelemetry telemetry = includeTelemetry ? telemetry(containers) : AppTelemetry.unavailable();
        PostInstallGuide usageGuide = usageGuide(manifest, accessUrl, settings.privateAccessUrl());
        AppSetupGuide setupGuide = setupGuide(manifest, accessUrl, settings.privateAccessUrl());
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
            settings = normalizeSettings(new InstallSettings(
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
        AccessDesiredState desiredAccess = desiredAccessState(settings, manifest, accessUrl);
        AccessObservedState observedAccess = observedAccessState(settings, accessUrl);
        AppAccessRoute accessRoute = accessRoute(settings, accessUrl, observedAccess);
        AppHealthSnapshot healthSnapshot = repository.healthFor(app.appId()).orElse(null);
        String remediationStatus = healthSnapshot == null ? status.friendlyStatus() : healthSnapshot.status();
        String backupState = backupState(app.appId(), settings);
        AppRemediationView remediation = AppRemediationPolicy.remediation(
                app.appName(),
                remediationStatus,
                settings.lastRepairStatus(),
                settings.autoRepairEnabled(),
                "protected_by_restore_point".equals(backupState),
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

    private String backupState(String appId, InstallSettings settings) {
        if (settings == null || settings.backup() == null || !settings.backup().enabled()) {
            return "backup_disabled";
        }
        boolean hasCompletedRestorePoint = backupRepository.forApp(appId, 10).stream()
                .anyMatch(restorePoint -> "completed".equalsIgnoreCase(restorePoint.status()));
        return hasCompletedRestorePoint ? "protected_by_restore_point" : "backup_enabled_no_restore_point";
    }

    private boolean isRepairAvailable(String status) {
        return "Needs attention".equals(status) || "Unavailable".equals(status) || "Missing".equals(status) || "Paused".equals(status);
    }

    private AppHealthSnapshot healthSnapshot(InstalledApp app) {
        List<DockerContainerStatus> containers = composeExecutor.containers(composeFile(app), app.composeProject());
        AppRuntimeStatus runtime = runtimeStatusResolver.normalize(containers);
        ApplicationManifest manifest = catalogService.findById(app.appId()).orElse(null);
        String accessUrl = runtimeStatusResolver.accessUrl(app, manifest, containers);
        InstallSettings settings = normalizeSettings(repository.settingsFor(app.appId()).orElseGet(() -> InstallSettings.defaults(accessUrl)), app, manifest, accessUrl);
        AppAccessCheck localCheck = shouldCheckLocalAccess(manifest, accessUrl)
                ? localHealthCheck(app.appId(), manifest, accessUrl)
                : AppAccessCheck.notConfigured(app.appId());
        AppAccessCheck privateCheck = settings.tailscaleEnabled()
                ? privateAccessPortConflict(settings, accessUrl)
                        ? AppAccessCheck.unreachable(app.appId(), settings.privateAccessUrl())
                        : privateAccessCheck(app.appId(), settings.privateAccessUrl())
                : AppAccessCheck.notConfigured(app.appId());
        settings = updateAccessCheckTimestamps(app, settings, localCheck);
        AppHealthSnapshot snapshot = buildHealthSnapshot(app, runtime, manifest, settings, localCheck, privateCheck);
        repository.healthFor(app.appId())
                .filter(previous -> !previous.status().equals(snapshot.status()))
                .ifPresent(previous -> {
                    String message = app.appName() + " changed from " + previous.status() + " to " + snapshot.status() + ".";
                    repository.recordEvent(app.appId(), "health_changed", message);
                    if ("Ready".equals(snapshot.status())) {
                        activitySuccess("health_changed", app.appName() + " is ready", message, app.appId());
                    } else {
                        activityWarning("health_changed", app.appName() + " needs attention", message, app.appId());
                    }
                });
        repository.saveHealthSnapshot(snapshot);
        return snapshot;
    }

    private InstallSettings updateAccessCheckTimestamps(InstalledApp app, InstallSettings settings, AppAccessCheck localCheck) {
        if ("not_configured".equals(localCheck.status())) {
            return settings;
        }
        InstallSettings updated = new InstallSettings(
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

    private AppHealthSnapshot buildHealthSnapshot(InstalledApp app, AppRuntimeStatus runtime, ApplicationManifest manifest, InstallSettings settings, AppAccessCheck localCheck, AppAccessCheck privateCheck) {
        Instant now = Instant.now();
        HealthManifest health = healthContract(manifest);
        Duration startupGracePeriod = Duration.ofSeconds(health.startupGraceSeconds());
        boolean startupGrace = "Starting".equals(runtime.friendlyStatus()) && app.installedAt().plus(startupGracePeriod).isAfter(now);
        boolean localRequired = shouldCheckLocalAccess(manifest, localCheck.url());
        boolean localBroken = localRequired && "unreachable".equals(localCheck.status());
        boolean privateBroken = settings != null
                && "required".equals(settings.privateAccessRequirement())
                && !"reachable".equals(privateCheck.status());
        boolean privateEnabledBroken = !"not_configured".equals(privateCheck.status()) && "unreachable".equals(privateCheck.status());
        boolean containerOnly = Set.of("container", "no-web-ui", "none").contains(health.type());

        String status;
        String message;
        String detail;
        if ("Ready".equals(runtime.friendlyStatus()) && !localBroken && !privateBroken && !privateEnabledBroken) {
            status = "Ready";
            message = health.successLabel();
            detail = containerOnly ? health.description() : "Docker is running and expected links are responding.";
        } else if ("Starting".equals(runtime.friendlyStatus()) && startupGrace) {
            status = "Starting";
            message = health.startingLabel();
            detail = "Project OS is giving this app up to " + health.startupGraceSeconds() + " seconds to finish startup before marking it as unhealthy.";
        } else if ("Stopped".equals(runtime.friendlyStatus())) {
            status = "Paused";
            message = "Paused";
            detail = "The app containers are stopped. Start the app when you want to use it.";
        } else if ("Stopped".equals(runtime.friendlyStatus()) || "not running".equals(runtime.healthCheck())) {
            status = "Unavailable";
            message = "Unavailable";
            detail = "Project OS could not find running managed containers for this app.";
        } else if (localBroken) {
            status = "Needs attention";
            message = health.failureLabel();
            detail = "Docker reports the app is running, but the local app link did not answer.";
        } else if (privateBroken || privateEnabledBroken) {
            status = "Needs attention";
            message = "Private link is not responding";
            detail = "Private access is expected, but the private HTTPS link did not answer.";
        } else if ("Needs attention".equals(runtime.friendlyStatus())) {
            status = "Needs attention";
            message = "Container health check is failing";
            detail = runtime.technicalStatus();
        } else if ("Starting".equals(runtime.friendlyStatus())) {
            status = "Needs attention";
            message = "Startup is taking longer than expected";
            detail = "This app is still starting after its expected startup window of " + health.startupGraceSeconds() + " seconds.";
        } else {
            status = "Unavailable";
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

    private boolean shouldCheckLocalAccess(ApplicationManifest manifest, String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return false;
        }
        HealthManifest health = healthContract(manifest);
        if (Set.of("container", "no-web-ui", "none").contains(health.type())) {
            return false;
        }
        String kind = manifest == null || manifest.access() == null ? "" : manifest.access().kind();
        return kind == null || !kind.equals("background");
    }

    private HealthManifest healthContract(ApplicationManifest manifest) {
        if (manifest == null || manifest.health() == null) {
            return HealthManifest.defaults(AccessManifest.defaults(), com.projectos.marketplace.model.UsageManifest.defaults());
        }
        return manifest.health();
    }

    private PostInstallGuide usageGuide(ApplicationManifest manifest, String accessUrl, String privateAccessUrl) {
        if (manifest == null) {
            return null;
        }
        return postInstallGuideBuilder.build(manifest, accessUrl, privateAccessUrl, installedProvisioningValues(manifest));
    }

    private AppSetupGuide setupGuide(ApplicationManifest manifest, String accessUrl, String privateAccessUrl) {
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

    private PostInstallProvisioningResult installedProvisioningValues(ApplicationManifest manifest) {
        if (!"obsidian-livesync".equals(manifest.id())) {
            return PostInstallProvisioningResult.empty();
        }
        Map<String, String> environment = new LinkedHashMap<>();
        for (String entry : manifest.runtime().environment()) {
            String[] parts = entry.split("=", 2);
            if (parts.length == 2) {
                environment.put(parts[0], parts[1]);
            }
        }
        return new PostInstallProvisioningResult(
                List.of(),
                List.of(),
                Map.of(
                        "username", environment.getOrDefault("COUCHDB_USER", "projectos"),
                        "password", environment.getOrDefault("COUCHDB_PASSWORD", ""),
                        "database", "obsidian"));
    }

    private AppAccessCheck localHealthCheck(String appId, ApplicationManifest manifest, String accessUrl) {
        HealthManifest health = healthContract(manifest);
        if ("tcp".equals(health.type())) {
            return tcpAccessCheck(appId, accessUrl);
        }
        return accessCheck(appId, accessUrl);
    }

    private AppTelemetry telemetry(List<DockerContainerStatus> containers) {
        return appTelemetryService.telemetryForContainers(containers);
    }

    private AppAccessCheck accessCheck(String appId, String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return AppAccessCheck.notConfigured(appId);
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(accessUrl))
                    .timeout(ACCESS_CHECK_TIMEOUT)
                    .method("HEAD", HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() >= 200 && response.statusCode() < 500) {
                return AppAccessCheck.reachable(appId, accessUrl);
            }
            return AppAccessCheck.unreachable(appId, accessUrl);
        } catch (IllegalArgumentException | IOException exception) {
            return AppAccessCheck.unreachable(appId, accessUrl);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return AppAccessCheck.unreachable(appId, accessUrl);
        }
    }

    private AppAccessCheck privateAccessCheck(String appId, String privateAccessUrl) {
        if (privateAccessUrl == null || privateAccessUrl.isBlank()) {
            return AppAccessCheck.notConfigured(appId);
        }
        if (devMode) {
            return AppAccessCheck.reachable(appId, privateAccessUrl);
        }
        return accessCheck(appId, privateAccessUrl);
    }

    private AppAccessCheck tcpAccessCheck(String appId, String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return AppAccessCheck.notConfigured(appId);
        }
        try {
            URI uri = URI.create(accessUrl);
            int port = uri.getPort();
            if (port < 1) {
                port = "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
            }
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(uri.getHost(), port), (int) ACCESS_CHECK_TIMEOUT.toMillis());
                return AppAccessCheck.reachable(appId, accessUrl);
            }
        } catch (IllegalArgumentException | IOException exception) {
            return AppAccessCheck.unreachable(appId, accessUrl);
        }
    }

    private InstallSettings sanitize(InstallSettings settings, InstalledApp app) {
        if (settings == null) {
            throw new InstallationException("Settings are required.");
        }
        String accessUrl = cleanAccessUrl(settings.accessUrl(), app.accessUrl());
        String privateAccessUrl = cleanOptionalAccessUrl(settings.privateAccessUrl());
        BackupPolicy backup = sanitizeBackup(settings.backup());
        Map<String, String> storage = sanitizeStorage(settings.storageSubfolders());
        String desiredMode = sanitizeAccessMode(settings.desiredAccessMode(), settings.tailscaleEnabled() ? "private" : null);
        String privateAccessRequirement = sanitizePrivateAccessRequirement(settings.privateAccessRequirement(), false);
        Integer expectedLocalPort = settings.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(accessUrl) : settings.expectedLocalPort();
        String expectedProtocol = sanitizeProtocol(settings.expectedProtocol(), accessUrl);
        return new InstallSettings(
                accessUrl,
                privateAccessUrl,
                settings.tailscaleEnabled(),
                storage,
                backup,
                desiredMode,
                privateAccessRequirement,
                expectedLocalPort,
                expectedProtocol,
                settings.lastAccessCheckAt(),
                settings.lastSuccessfulAccessAt(),
                settings.lastRepairAttemptAt(),
                settings.lastRepairStatus(),
                settings.autoRepairEnabled());
    }

    private InstallSettings normalizeSettings(InstallSettings settings, InstalledApp app, ApplicationManifest manifest, String accessUrl) {
        AccessManifest accessManifest = manifest == null ? AccessManifest.defaults() : manifest.access();
        String desiredMode = sanitizeAccessMode(settings.desiredAccessMode(), settings.tailscaleEnabled() ? "private" : accessManifest.defaultMode());
        String requirement = privateAccessRequirement(settings.privateAccessRequirement(), manifest);
        Integer expectedPort = settings.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(accessUrl) : settings.expectedLocalPort();
        String expectedProtocol = sanitizeProtocol(settings.expectedProtocol(), accessUrl);
        InstallSettings normalized = new InstallSettings(
                accessUrl == null ? settings.accessUrl() : accessUrl,
                settings.privateAccessUrl(),
                settings.tailscaleEnabled(),
                settings.storageSubfolders() == null ? Map.of() : settings.storageSubfolders(),
                settings.backup() == null ? BackupPolicy.defaults() : settings.backup(),
                desiredMode,
                requirement,
                expectedPort,
                expectedProtocol,
                settings.lastAccessCheckAt(),
                settings.lastSuccessfulAccessAt(),
                settings.lastRepairAttemptAt(),
                settings.lastRepairStatus(),
                settings.autoRepairEnabled());
        if (!normalized.equals(settings)) {
            repository.saveSettings(app.appId(), normalized);
        }
        return normalized;
    }

    private AccessDesiredState desiredAccessState(InstallSettings settings, ApplicationManifest manifest, String accessUrl) {
        String mode = sanitizeAccessMode(settings.desiredAccessMode(), settings.tailscaleEnabled() ? "private" : null);
        String requirement = privateAccessRequirement(settings.privateAccessRequirement(), manifest);
        boolean privateRecommended = manifest != null && manifest.access().privateAccessRecommended();
        return new AccessDesiredState(
                mode,
                accessModeLabel(mode),
                accessUrl,
                settings.privateAccessUrl(),
                settings.expectedLocalPort(),
                firstPresent(settings.expectedProtocol(), "http"),
                requirement,
                "required".equals(requirement),
                privateRecommended);
    }

    private AccessObservedState observedAccessState(InstallSettings settings, String accessUrl) {
        String privateStatus;
        if (!settings.tailscaleEnabled()) {
            privateStatus = "not_enabled";
        } else if (settings.privateAccessUrl() == null || settings.privateAccessUrl().isBlank()) {
            privateStatus = "missing";
        } else {
            privateStatus = "configured";
        }
        return new AccessObservedState(
                accessUrl,
                settings.privateAccessUrl(),
                runtimeStatusResolver.portFromUrl(accessUrl),
                runtimeStatusResolver.protocolFromUrl(accessUrl),
                privateStatus,
                settings.lastAccessCheckAt(),
                settings.lastSuccessfulAccessAt(),
                settings.lastRepairAttemptAt(),
                settings.lastRepairStatus());
    }

    private AppAccessRoute accessRoute(InstallSettings settings, String accessUrl, AccessObservedState observedAccess) {
        Integer localPort = runtimeStatusResolver.portFromUrl(accessUrl);
        Integer privatePort = runtimeStatusResolver.portFromUrl(settings.privateAccessUrl());
        String privateStatus = observedAccess == null ? "not_enabled" : observedAccess.privateLinkStatus();
        boolean privateLinkUsesLocalHttpPort = privateAccessPortConflict(settings, accessUrl);
        String primaryOpenUrl = !privateLinkUsesLocalHttpPort
                ? firstPresent(settings.privateAccessUrl(), accessUrl)
                : firstPresent(accessUrl, settings.privateAccessUrl());
        String backendProtocol = firstPresent(settings.expectedProtocol(), runtimeStatusResolver.protocolFromUrl(accessUrl), "http");
        String backendTargetUrl = localPort == null ? null : backendProtocol + "://127.0.0.1:" + localPort;
        return new AppAccessRoute(
                primaryOpenUrl,
                accessUrl,
                settings.privateAccessUrl(),
                backendTargetUrl,
                backendProtocol,
                localPort,
                privatePort,
                privateLinkUsesLocalHttpPort ? "port_conflict" : privateStatus);
    }

    private boolean privateAccessPortConflict(InstallSettings settings, String accessUrl) {
        Integer localPort = runtimeStatusResolver.portFromUrl(accessUrl);
        Integer privatePort = runtimeStatusResolver.portFromUrl(settings.privateAccessUrl());
        return settings.tailscaleEnabled() && localPort != null && privatePort != null && localPort.equals(privatePort);
    }

    private String sanitizeAccessMode(String mode, String fallback) {
        String value = firstPresent(mode, fallback, "local").trim().toLowerCase();
        return switch (value) {
            case "private", "local-and-private", "none", "public", "network", "local" -> value;
            default -> "local";
        };
    }

    private String sanitizePrivateAccessRequirement(String requirement, boolean required) {
        String fallback = required ? "required" : "optional";
        String value = firstPresent(requirement, fallback).trim().toLowerCase();
        return switch (value) {
            case "required", "recommended", "optional", "disabled" -> value;
            default -> fallback;
        };
    }

    private String sanitizeProtocol(String protocol, String accessUrl) {
        String value = firstPresent(protocol, runtimeStatusResolver.protocolFromUrl(accessUrl), "http").trim().toLowerCase();
        return switch (value) {
            case "http", "https" -> value;
            default -> "http";
        };
    }

    private String privateAccessRequirement(String requestedRequirement, ApplicationManifest manifest) {
        boolean recommendedByCatalog = manifest != null && manifest.usage().privateHttpsRequired();
        if (recommendedByCatalog && (requestedRequirement == null
                || requestedRequirement.isBlank()
                || "optional".equalsIgnoreCase(requestedRequirement))) {
            return "recommended";
        }
        String fallback = recommendedByCatalog ? "recommended" : "optional";
        return sanitizePrivateAccessRequirement(firstPresent(requestedRequirement, fallback), false);
    }

    private String accessModeLabel(String mode) {
        return switch (mode) {
            case "private" -> "Your private devices";
            case "local-and-private" -> "This device and your private devices";
            case "network" -> "Your home network";
            case "public" -> "Wider internet";
            case "none" -> "No browser link";
            default -> "Only this device";
        };
    }

    private String cleanAccessUrl(String accessUrl, String fallback) {
        String value = accessUrl == null || accessUrl.isBlank() ? fallback : accessUrl.trim();
        if (value == null || value.isBlank()) {
            return null;
        }
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            throw new InstallationException("Access URL must start with http:// or https://.");
        }
        return value;
    }

    private String cleanOptionalAccessUrl(String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return null;
        }
        String value = accessUrl.trim();
        if (!value.startsWith("https://")) {
            throw new InstallationException("Private access URL must start with https://.");
        }
        return value;
    }

    private BackupPolicy sanitizeBackup(BackupPolicy backup) {
        if (backup == null) {
            return BackupPolicy.defaults();
        }
        String frequency = backup.frequency() == null || backup.frequency().isBlank() ? "daily" : backup.frequency().trim().toLowerCase();
        if (!BACKUP_FREQUENCIES.contains(frequency)) {
            throw new InstallationException("Backup frequency must be hourly, daily, or weekly.");
        }
        if (backup.retention() < 1 || backup.retention() > 90) {
            throw new InstallationException("Backup retention must be between 1 and 90.");
        }
        return new BackupPolicy(backup.enabled(), frequency, backup.retention());
    }

    private Map<String, String> sanitizeStorage(Map<String, String> storageSubfolders) {
        if (storageSubfolders == null || storageSubfolders.isEmpty()) {
            return Map.of();
        }
        Map<String, String> sanitized = new LinkedHashMap<>();
        storageSubfolders.forEach((key, value) -> {
            if (key == null || key.isBlank()) {
                throw new InstallationException("Storage folder keys cannot be blank.");
            }
            String folder = value == null ? "" : value.trim();
            if (folder.isBlank()) {
                return;
            }
            if (!SAFE_STORAGE_NAME.matcher(folder).matches()) {
                throw new InstallationException("Storage folders can use letters, numbers, dots, underscores, and dashes only.");
            }
            sanitized.put(key.trim(), folder);
        });
        return sanitized;
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

    private InstalledApp reconcileRuntimeMetadata(InstalledApp app, AppRuntimeMetadata metadata) {
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

        InstalledAppOwnershipMetadata current = repository.ownershipFor(app.appId()).orElse(null);
        if (current == null) {
            return reconciled;
        }
        String appInstanceId = firstPresent(metadata.appInstanceId(), current.appInstanceId());
        String projectOsInstanceId = firstPresent(metadata.instanceId(), current.projectOsInstanceId());
        if (!Objects.equals(appInstanceId, current.appInstanceId())
                || !Objects.equals(projectOsInstanceId, current.projectOsInstanceId())
                || !Objects.equals(app.runtimePath(), current.runtimePathOrHash())) {
            repository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
                    app.appId(),
                    appInstanceId,
                    app.appId(),
                    projectOsInstanceId,
                    app.runtimePath(),
                    firstPresent(current.installState(), "ready"),
                    firstPresent(current.ownershipStatus(), "owned"),
                    current.createdAt(),
                    Instant.now()));
        }
        return reconciled;
    }

    private InstalledApp installedApp(String appId) {
        return repository.findById(appId)
                .orElseThrow(() -> new InstallationException("Project-OS is not managing an app with id " + appId + "."));
    }

    private List<InstalledApp> managedInstalledApps() {
        return repository.findAll().stream()
                .filter(this::ownedByThisProjectOs)
                .toList();
    }

    private boolean ownedByThisProjectOs(InstalledApp app) {
        return repository.ownershipFor(app.appId())
                .filter(metadata -> "owned".equalsIgnoreCase(metadata.ownershipStatus()))
                .filter(metadata -> metadata.appInstanceId() != null && !metadata.appInstanceId().isBlank())
                .filter(metadata -> metadata.projectOsInstanceId() != null && !metadata.projectOsInstanceId().isBlank())
                .isPresent();
    }

    private void assertLifecycleEligible(InstalledApp app, String action) {
        InstalledAppOwnershipMetadata metadata = repository.ownershipFor(app.appId())
                .orElseThrow(() -> new InstallationException(app.appName() + " is not owned by this Project OS instance, so Project OS will not " + action + " it automatically."));
        if (!"owned".equalsIgnoreCase(metadata.ownershipStatus())) {
            throw new InstallationException(app.appName() + " is not owned by this Project OS instance, so Project OS will not " + action + " it automatically.");
        }
        if (metadata.appInstanceId() == null || metadata.appInstanceId().isBlank()
                || metadata.projectOsInstanceId() == null || metadata.projectOsInstanceId().isBlank()) {
            throw new InstallationException(app.appName() + " has incomplete Project OS ownership metadata, so Project OS will not " + action + " it automatically.");
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

    private Path backupRoot() {
        return runtimeLayout.runtimeRoot().resolve("backups").toAbsolutePath().normalize();
    }

    private boolean hasCheckpointableData(InstalledApp app) {
        Path source = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        return Files.isDirectory(source) && directorySize(source) > 0;
    }

    private long zipDirectory(Path source, Path destination) throws IOException {
        AtomicLong writtenBytes = new AtomicLong();
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(destination))) {
            Files.walkFileTree(source, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    if (!attrs.isRegularFile() || !Files.isReadable(file)) {
                        return FileVisitResult.CONTINUE;
                    }
                    Path relative = source.relativize(file);
                    ZipEntry entry = new ZipEntry(relative.toString());
                    zip.putNextEntry(entry);
                    long copied = Files.copy(file, zip);
                    writtenBytes.addAndGet(copied);
                    zip.closeEntry();
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exception) {
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) {
                    return Files.isReadable(directory) ? FileVisitResult.CONTINUE : FileVisitResult.SKIP_SUBTREE;
                }
            });
        }
        return Files.size(destination) > 0 ? Files.size(destination) : writtenBytes.get();
    }

    private long directorySize(Path path) {
        if (!Files.exists(path)) {
            return 0;
        }
        AtomicLong total = new AtomicLong();
        try {
            Files.walkFileTree(path, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (attrs.isRegularFile()) {
                        total.addAndGet(attrs.size());
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exception) {
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) {
                    return Files.isReadable(directory) ? FileVisitResult.CONTINUE : FileVisitResult.SKIP_SUBTREE;
                }
            });
        } catch (IOException | SecurityException ignored) {
            return total.get();
        }
        return total.get();
    }

    private record SafetyCheckpointResult(boolean created, List<String> logs) {
    }
}
