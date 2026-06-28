package com.projectos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.backups.BackupRepository;
import com.projectos.backups.RestorePoint;
import com.projectos.marketplace.catalog.ManifestValidator;
import com.projectos.marketplace.catalog.ManifestYamlReader;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.install.AppActionResult;
import com.projectos.marketplace.install.AppGuardianService;
import com.projectos.marketplace.install.AppHealthSnapshot;
import com.projectos.marketplace.install.AppInstanceView;
import com.projectos.marketplace.install.AppReliabilitySummary;
import com.projectos.marketplace.install.AppLifecycleService;
import com.projectos.marketplace.install.AppRuntimeView;
import com.projectos.marketplace.install.AppSettingsChangePlan;
import com.projectos.marketplace.install.BackupPolicy;
import com.projectos.marketplace.install.ContainerTelemetry;
import com.projectos.marketplace.install.DockerContainerStatus;
import com.projectos.marketplace.install.DockerComposeExecutor;
import com.projectos.marketplace.install.DockerComposeResult;
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppOwnershipMetadata;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.install.ManagedContainer;
import com.projectos.marketplace.install.PostInstallGuideBuilder;
import com.projectos.marketplace.install.UninstallPlan;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.network.tailscale.TailscaleServeResult;
import com.projectos.network.tailscale.TailscaleService;

class AppLifecycleServiceTests {

    @TempDir
    Path runtimeRoot;

    InstalledAppRepository repository;
    AppLifecycleService service;
    FakeLifecycleDockerComposeExecutor composeExecutor;
    FakeTailscaleService tailscaleService;
    RuntimeLayout runtimeLayout;

    @BeforeEach
    void setUp() throws Exception {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        runtimeLayout = new RuntimeLayout(properties);
        repository = new InstalledAppRepository(runtimeLayout);
        composeExecutor = new FakeLifecycleDockerComposeExecutor();
        tailscaleService = new FakeTailscaleService();
        service = new AppLifecycleService(
                repository,
                composeExecutor,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                () -> List.of(),
                runtimeLayout,
                new PostInstallGuideBuilder(),
                tailscaleService);
        Path appRoot = runtimeRoot.resolve("apps/vaultwarden");
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services: {}\n");
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", appRoot.toString(), "project-os-vaultwarden", "http://localhost:8090", Instant.parse("2026-06-11T00:00:00Z")));
        repository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
                "vaultwarden",
                "appinst_vaultwarden",
                "vaultwarden",
                "pos_test",
                appRoot.toString(),
                "ready",
                "owned",
                Instant.parse("2026-06-11T00:00:00Z"),
                Instant.parse("2026-06-11T00:00:00Z")));
        repository.recordEvent("vaultwarden", "installed", "Vaultwarden installed successfully.");
    }

    @Test
    void returnsFriendlyRuntimeStatusAndRecentEvents() {
        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.friendlyStatus()).isEqualTo("Ready");
        assertThat(app.healthCheck()).isEqualTo("passing");
        assertThat(app.category()).isEqualTo("Security");
        assertThat(app.telemetry().cpuPercent()).isEqualTo("Unavailable");
        assertThat(app.appConfiguration()).isNotEmpty();
        assertThat(app.recentEvents()).hasSize(1);
    }

    @Test
    void telemetryIsLoadedOnDemandOutsideApplicationListRefresh() {
        assertThat(service.telemetry("vaultwarden").cpuPercent()).isEqualTo("1.25%");
    }

    @Test
    void lifecycleActionRejectsLegacyUnscopedAppsBeforeCallingDocker() {
        repository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
                "vaultwarden",
                "",
                "vaultwarden",
                "",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "legacy_unscoped",
                "legacy_unscoped",
                Instant.parse("2026-06-11T00:00:00Z"),
                Instant.parse("2026-06-11T00:00:00Z")));

        assertThatThrownBy(() -> service.start("vaultwarden"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("not owned by this Project OS instance");
        assertThat(composeExecutor.upCalled).isFalse();
    }

    @Test
    void telemetryForAllAppsUsesAppIdsAsKeys() {
        assertThat(service.telemetry())
                .containsKey("vaultwarden")
                .extractingByKey("vaultwarden")
                .satisfies(telemetry -> assertThat(telemetry.cpuPercent()).isEqualTo("1.25%"));
    }

    @Test
    void appListOnlyIncludesCanonicalManagedApps() throws Exception {
        Path homepageRoot = runtimeRoot.resolve("apps/homepage");
        Files.createDirectories(homepageRoot);
        repository.save(new InstalledApp("homepage", "Homepage", "Ready", homepageRoot.toString(), "project-os-homepage", "http://localhost:3000", Instant.parse("2026-06-11T00:00:00Z")));
        AppLifecycleService canonicalService = new AppLifecycleService(
                repository,
                composeExecutor,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                () -> List.of(),
                runtimeLayout,
                new PostInstallGuideBuilder(),
                new FakeTailscaleService(),
                false,
                null,
                new BackupRepository(runtimeLayout),
                () -> List.of(appInstance("homepage", "Homepage")));

        assertThat(canonicalService.listApps())
                .extracting(AppRuntimeView::appId)
                .containsExactly("homepage");
    }

    @Test
    void accessChecksAreKeyedByAppId() {
        assertThat(service.accessChecks())
                .containsKey("vaultwarden")
                .extractingByKey("vaultwarden")
                .satisfies(check -> assertThat(check.status()).isIn("reachable", "unreachable"));
    }

    @Test
    void healthSnapshotTreatsSlowStartupAsStartingDuringGracePeriod() {
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", runtimeRoot.resolve("apps/vaultwarden").toString(), "project-os-vaultwarden", "http://localhost:8090", Instant.now()));
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "starting",
                "Up 20 seconds (health: starting)",
                "0.0.0.0:8090->80/tcp"));

        AppHealthSnapshot snapshot = service.healthSnapshot("vaultwarden");

        assertThat(snapshot.status()).isEqualTo("Starting");
        assertThat(snapshot.startupGrace()).isTrue();
        assertThat(repository.healthFor("vaultwarden").orElseThrow().status()).isEqualTo("Starting");
    }

    @Test
    void healthSnapshotMarksStoppedContainersAsPaused() {
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "exited",
                "",
                "Exited 1 minute ago",
                "0.0.0.0:8090->80/tcp"));

        AppHealthSnapshot snapshot = service.healthSnapshot("vaultwarden");

        assertThat(snapshot.status()).isEqualTo("Paused");
        assertThat(snapshot.message()).isEqualTo("Paused");
        assertThat(snapshot.dockerStatus()).isEqualTo("Stopped");
    }

    @Test
    void restartRecordsLifecycleEvent() {
        AppActionResult result = service.restart("vaultwarden");

        assertThat(result.ok()).isTrue();
        assertThat(result.severity()).isEqualTo("success");
        assertThat(result.title()).isEqualTo("App restarted");
        assertThat(result.nextAction()).isEqualTo("refresh_apps");
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.app().friendlyStatus()).isEqualTo("Ready");
        assertThat(repository.eventsFor("vaultwarden", 5))
                .extracting(event -> event.type())
                .contains("restart");
    }

    @Test
    void repairStartsPausedApp() {
        composeExecutor.transitionToStarting = true;
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "exited",
                "",
                "Exited 1 minute ago",
                "0.0.0.0:8090->80/tcp"));

        AppActionResult result = service.repair("vaultwarden");

        assertThat(result.action()).isEqualTo("repair");
        assertThat(result.message()).contains("Vaultwarden");
        assertThat(composeExecutor.upCalled).isTrue();
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .contains("repair_started", "repair_completed");
    }

    @Test
    void repairRestartsUnhealthyApp() {
        composeExecutor.transitionToStarting = true;
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));

        AppActionResult result = service.repair("vaultwarden");

        assertThat(result.action()).isEqualTo("repair");
        assertThat(composeExecutor.restartCalled).isTrue();
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .contains("repair_step_completed", "repair_completed");
    }

    @Test
    void guardianRepairsUnhealthyAppAndRecordsSteps() {
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", runtimeRoot.resolve("apps/vaultwarden").toString(), "project-os-vaultwarden", "http://localhost:8090", Instant.now()));
        composeExecutor.transitionToStarting = true;
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));
        AppGuardianService guardian = new AppGuardianService(repository, service, true);

        guardian.inspectApp(repository.findById("vaultwarden").orElseThrow());

        assertThat(composeExecutor.restartCalled).isTrue();
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().lastRepairStatus()).isEqualTo("guardian_repair_completed");
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .contains("guardian_issue_detected", "guardian_repair_started", "guardian_repair_step_completed", "guardian_repair_completed");
    }

    @Test
    void guardianSkipsAppsWhenAutoRepairIsDisabled() {
        repository.saveSettings("vaultwarden", new InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of(),
                BackupPolicy.defaults(),
                "local",
                "optional",
                8090,
                "http",
                null,
                null,
                null,
                null,
                false));
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));
        AppGuardianService guardian = new AppGuardianService(repository, service, true);

        guardian.inspectApp(repository.findById("vaultwarden").orElseThrow());

        assertThat(composeExecutor.restartCalled).isFalse();
    }

    @Test
    void guardianPersistsBackoffWhenOwnershipBlocksAutomaticRepair() {
        repository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
                "vaultwarden",
                "",
                "vaultwarden",
                "",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "legacy_unscoped",
                "legacy_unscoped",
                Instant.parse("2026-06-11T00:00:00Z"),
                Instant.parse("2026-06-11T00:00:00Z")));
        repository.saveSettings("vaultwarden", new InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of(),
                BackupPolicy.defaults(),
                "local",
                "optional",
                8090,
                "http",
                null,
                null,
                null,
                null,
                true));
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));
        AppGuardianService guardian = new AppGuardianService(repository, service, true);

        guardian.inspectApp(repository.findById("vaultwarden").orElseThrow());
        guardian.inspectApp(repository.findById("vaultwarden").orElseThrow());

        InstallSettings settings = repository.settingsFor("vaultwarden").orElseThrow();
        assertThat(settings.lastRepairAttemptAt()).isNotNull();
        assertThat(settings.lastRepairStatus()).isEqualTo("guardian_repair_blocked");
        assertThat(composeExecutor.restartCalled).isFalse();
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .containsOnlyOnce("guardian_issue_detected");
    }

    @Test
    void reliabilitySummaryHighlightsIssuesAndRepairActivity() {
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));
        service.healthSnapshot("vaultwarden");
        repository.recordEvent("vaultwarden", "guardian_repair_failed", "Docker did not restart the app.");

        AppReliabilitySummary summary = service.reliabilitySummary();

        assertThat(summary.posture()).isEqualTo("warning");
        assertThat(summary.needsAttentionApps()).isEqualTo(1);
        assertThat(summary.issues())
                .extracting(issue -> issue.appId())
                .contains("vaultwarden");
        assertThat(summary.recentFailedRepairs()).isGreaterThanOrEqualTo(1);
        assertThat(summary.recentActivity())
                .extracting(activity -> activity.type())
                .contains("guardian_repair_failed");
    }

    @Test
    void runningContainerIsReadyEvenWhenRawStatusMentionsCreatedTime() {
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 3 minutes (healthy), Created 4 minutes ago",
                "0.0.0.0:8090->80/tcp"));

        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.friendlyStatus()).isEqualTo("Ready");
        assertThat(app.healthCheck()).isEqualTo("passing");
        assertThat(app.technicalStatus()).contains("running");
    }

    @Test
    void refreshCorrectsStaleAccessUrlFromPublishedDockerPort() {
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", runtimeRoot.resolve("apps/vaultwarden").toString(), "project-os-vaultwarden", "https://vault.home", Instant.parse("2026-06-11T00:00:00Z")));

        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.accessUrl()).isEqualTo("http://localhost:8090");
        assertThat(repository.findById("vaultwarden").orElseThrow().accessUrl()).isEqualTo("http://localhost:8090");
    }

    @Test
    void refreshCorrectsStaleAccessUrlFromDockerJsonEscapedPorts() {
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", runtimeRoot.resolve("apps/vaultwarden").toString(), "project-os-vaultwarden", "https://vault.home", Instant.parse("2026-06-11T00:00:00Z")));
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 3 minutes (healthy)",
                "0.0.0.0:8090-\\u003e80/tcp"));

        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.accessUrl()).isEqualTo("http://localhost:8090");
    }

    @Test
    void refreshUsesManifestWebPortForMultiPortApps() throws Exception {
        Path appRoot = runtimeRoot.resolve("apps/gitea");
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services: {}\n");
        repository.save(new InstalledApp(
                "gitea",
                "Gitea",
                "Installed",
                appRoot.toString(),
                "project-os-gitea",
                "http://localhost:2222",
                Instant.parse("2026-06-11T00:00:00Z")));
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-gitea",
                "gitea",
                "running",
                "",
                "Up 2 minutes",
                "0.0.0.0:2222->22/tcp, 0.0.0.0:3002->3000/tcp"));

        AppRuntimeView app = service.getApp("gitea");

        assertThat(app.accessUrl()).isEqualTo("http://localhost:3002");
        assertThat(repository.findById("gitea").orElseThrow().accessUrl()).isEqualTo("http://localhost:3002");
    }

    @Test
    void devModeTreatsMockPrivateLinksAsReachable() throws Exception {
        Path appRoot = runtimeRoot.resolve("apps/private-worker");
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services: {}\n");
        repository.save(new InstalledApp(
                "private-worker",
                "Private Worker",
                "Installed",
                appRoot.toString(),
                "project-os-private-worker",
                null,
                Instant.parse("2026-06-11T00:00:00Z")));
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-private-worker",
                "private-worker",
                "running",
                "",
                "Up 2 minutes",
                ""));
        AppLifecycleService devService = new AppLifecycleService(
                repository,
                composeExecutor,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                () -> List.of(),
                runtimeLayout,
                new PostInstallGuideBuilder(),
                new FakeTailscaleService(),
                true);
        repository.saveSettings("private-worker", new InstallSettings(
                null,
                "https://project-os-dev.tailnet.local:8090",
                true,
                java.util.Map.of(),
                BackupPolicy.defaults()));

        AppHealthSnapshot snapshot = devService.healthSnapshot("private-worker");

        assertThat(snapshot.status()).isEqualTo("Ready");
        assertThat(snapshot.privateAccessStatus()).isEqualTo("reachable");
    }

    @Test
    void refreshExposesDesiredAndObservedAccessState() {
        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.desiredAccess().mode()).isEqualTo("local");
        assertThat(app.desiredAccess().label()).isEqualTo("Only this device");
        assertThat(app.desiredAccess().expectedLocalPort()).isEqualTo(8090);
        assertThat(app.desiredAccess().expectedProtocol()).isEqualTo("http");
        assertThat(app.observedAccess().localUrl()).isEqualTo("http://localhost:8090");
        assertThat(app.observedAccess().localPort()).isEqualTo(8090);
        assertThat(app.observedAccess().privateLinkStatus()).isEqualTo("not_enabled");
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().expectedLocalPort()).isEqualTo(8090);
    }

    @Test
    void refreshDoesNotUsePrivateLinkWhenItConflictsWithTheLocalHttpPort() {
        repository.saveSettings("vaultwarden", new InstallSettings(
                "http://localhost:8090",
                "https://project-os.example.ts.net:8090",
                true,
                java.util.Map.of(),
                BackupPolicy.defaults()));

        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.accessRoute().privateLinkStatus()).isEqualTo("port_conflict");
        assertThat(app.accessRoute().primaryOpenUrl()).isEqualTo("http://localhost:8090");
        assertThat(app.accessRoute().privateUrl()).isEqualTo("https://project-os.example.ts.net:8090");
    }

    @Test
    void repairRecreatesPrivateAccessWhenStoredPrivateLinkConflictsWithLocalHttpPort() {
        repository.saveSettings("vaultwarden", new InstallSettings(
                "http://localhost:8090",
                "https://project-os.example.ts.net:8090",
                true,
                java.util.Map.of(),
                BackupPolicy.defaults(),
                "private",
                "optional",
                8090,
                "http",
                null,
                null,
                null,
                null,
                true));
        AppLifecycleService devService = new AppLifecycleService(
                repository,
                composeExecutor,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                () -> List.of(),
                runtimeLayout,
                new PostInstallGuideBuilder(),
                tailscaleService,
                true);

        AppActionResult result = devService.repair("vaultwarden");

        assertThat(result.status()).isEqualTo("completed");
        assertThat(tailscaleService.lastLocalPort).isEqualTo(8090);
        assertThat(tailscaleService.lastHttpsPort).isNotEqualTo(8090);
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().privateAccessUrl())
                .isEqualTo("https://project-os.example.ts.net:" + tailscaleService.lastHttpsPort);
    }

    @Test
    void listAppsDoesNotAdoptRediscoveredManagedContainersFromDockerLabels() throws Exception {
        repository.delete("vaultwarden");
        Files.createDirectories(runtimeRoot.resolve("apps/vaultwarden"));
        Files.writeString(runtimeRoot.resolve("apps/vaultwarden/compose.yaml"), "services: {}\n");
        AppLifecycleService rediscoveryService = new AppLifecycleService(
                repository,
                composeExecutor,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                () -> List.of(new ManagedContainer("vaultwarden", "project-os-vaultwarden", "Up 2 minutes (healthy)")),
                runtimeLayout,
                new PostInstallGuideBuilder(),
                new FakeTailscaleService());

        List<AppRuntimeView> apps = rediscoveryService.listApps();

        assertThat(apps)
                .extracting(AppRuntimeView::appId)
                .doesNotContain("vaultwarden");
        assertThat(repository.findById("vaultwarden")).isEmpty();
    }

    @Test
    void uninstallPlanKeepsDataByDefault() {
        UninstallPlan plan = service.uninstallPlan("vaultwarden");

        assertThat(plan.willStop()).contains("Remove the Compose project");
        assertThat(plan.willKeep()).anySatisfy(item -> assertThat(item).contains("apps/vaultwarden"));
        assertThat(plan.safetyCheckpointPlanned()).isTrue();
        assertThat(plan.safetyCheckpointMessage()).contains("safety checkpoint");
    }

    @Test
    void uninstallCreatesSafetyCheckpointBeforeRemovingContainers() {
        AppActionResult result = service.uninstall("vaultwarden");

        assertThat(result.status()).isEqualTo("removed");
        assertThat(result.logs()).anySatisfy(log -> assertThat(log).contains("Created safety checkpoint"));
        List<RestorePoint> restorePoints = new BackupRepository(runtimeLayout).forApp("vaultwarden", 5);
        assertThat(restorePoints)
                .anySatisfy(point -> {
                    assertThat(point.source()).isEqualTo("pre_uninstall");
                    assertThat(point.status()).isEqualTo("completed");
                    assertThat(point.path()).contains("pre-uninstall");
                });
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .contains("safety_checkpoint_created");
    }

    @Test
    void updateSettingsPersistsValidatedUserPreferences() {
        AppRuntimeView app = service.updateSettings("vaultwarden", new InstallSettings(
                "http://localhost:8090",
                null,
                true,
                java.util.Map.of(),
                new BackupPolicy(true, "weekly", 14)));

        assertThat(app.settings().tailscaleEnabled()).isTrue();
        assertThat(app.settings().backup().frequency()).isEqualTo("weekly");
        assertThat(repository.eventsFor("vaultwarden", 5))
                .extracting(event -> event.type())
                .contains("settings_updated", "settings_apply_completed");
    }

    @Test
    void settingsPlanBlocksStorageFolderChangesUntilMigrationExists() {
        AppSettingsChangePlan plan = service.settingsChangePlan("vaultwarden", new InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of("data", "vault-data"),
                BackupPolicy.defaults()));

        assertThat(plan.saveAllowed()).isFalse();
        assertThat(plan.dataMigrationRequired()).isTrue();
        assertThat(plan.blockedReasons()).anyMatch(reason -> reason.contains("guarded data migration"));
        assertThatThrownBy(() -> service.updateSettings("vaultwarden", new InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of("data", "vault-data"),
                BackupPolicy.defaults())))
                .hasMessageContaining("guarded data migration");
    }

    @Test
    void changingLocalPortRendersComposeAndRestartsApp() throws Exception {
        AppSettingsChangePlan plan = service.settingsChangePlan("vaultwarden", new InstallSettings(
                "http://localhost:19090",
                null,
                false,
                java.util.Map.of(),
                BackupPolicy.defaults()));
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 1 second (healthy)",
                "0.0.0.0:19090->80/tcp"));

        AppRuntimeView app = service.updateSettings("vaultwarden", new InstallSettings(
                "http://localhost:19090",
                null,
                false,
                java.util.Map.of(),
                BackupPolicy.defaults()));

        assertThat(plan.redeployRequired()).isTrue();
        assertThat(app.accessUrl()).isEqualTo("http://localhost:19090");
        assertThat(composeExecutor.upCalled).isTrue();
        assertThat(Files.readString(runtimeRoot.resolve("apps/vaultwarden/compose.yaml"))).contains("19090:80");
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .contains("settings_change_planned", "settings_apply_started", "settings_redeploy_completed", "settings_apply_completed");
    }

    @Test
    void enablePrivateAccessCreatesTailscaleServeLinkAndPersistsIt() {
        AppActionResult result = service.enablePrivateAccess("vaultwarden");

        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.message()).contains("https://project-os.example.ts.net:");
        assertThat(tailscaleService.lastLocalPort).isEqualTo(8090);
        assertThat(tailscaleService.lastHttpsPort).isNotEqualTo(8090);
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().tailscaleEnabled()).isTrue();
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().privateAccessUrl()).isEqualTo("https://project-os.example.ts.net:" + tailscaleService.lastHttpsPort);
        assertThat(result.app().desiredAccess().mode()).isEqualTo("private");
        assertThat(result.app().observedAccess().privateLinkStatus()).isEqualTo("configured");
        assertThat(result.app().accessRoute().primaryOpenUrl()).isEqualTo("https://project-os.example.ts.net:" + tailscaleService.lastHttpsPort);
        assertThat(result.app().accessRoute().backendTargetUrl()).isEqualTo("http://127.0.0.1:8090");
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().lastRepairStatus()).isEqualTo("private_access_enabled");
        assertThat(repository.eventsFor("vaultwarden", 5))
                .extracting(event -> event.type())
                .contains("private_access_enabled");
    }

    @Test
    void installedCompanionServicesExposeUsageGuide() throws Exception {
        Path appRoot = runtimeRoot.resolve("apps/obsidian-livesync");
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services: {}\n");
        repository.save(new InstalledApp(
                "obsidian-livesync",
                "Obsidian LiveSync",
                "Installed",
                appRoot.toString(),
                "project-os-obsidian-livesync",
                "http://localhost:5984",
                Instant.parse("2026-06-11T00:00:00Z")));
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "project-os-obsidian-livesync",
                "obsidian-livesync",
                "running",
                "",
                "Up 2 minutes",
                "0.0.0.0:5984->5984/tcp"));

        AppRuntimeView app = service.getApp("obsidian-livesync");

        assertThat(app.usageGuide()).isNotNull();
        assertThat(app.usageGuide().kind()).isEqualTo("companion-service");
        assertThat(app.usageGuide().values())
                .anySatisfy(value -> {
                    assertThat(value.label()).isEqualTo("Database");
                    assertThat(value.value()).isEqualTo("obsidian");
                });
    }

    private AppInstanceView appInstance(String appId, String name) {
        return new AppInstanceView(
                "appinst_" + appId,
                appId,
                name,
                "General",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                "local_ready",
                "backup_disabled",
                "http://localhost:3000",
                null,
                List.of(),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));
    }

    private static class FakeTailscaleService extends TailscaleService {
        int lastLocalPort;
        int lastHttpsPort;

        @Override
        public TailscaleServeResult serveHttps(int localPort, int httpsPort) {
            lastLocalPort = localPort;
            lastHttpsPort = httpsPort;
            return new TailscaleServeResult(true, "https://project-os.example.ts.net:" + httpsPort, "Private HTTPS link is ready.", List.of("fake tailscale serve " + localPort));
        }
    }

    private static class FakeLifecycleDockerComposeExecutor implements DockerComposeExecutor {
        List<DockerContainerStatus> containers = List.of(new DockerContainerStatus(
                "project-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 2 minutes (healthy)",
                "0.0.0.0:8090->80/tcp"));
        boolean restartCalled;
        boolean upCalled;
        boolean transitionToStarting;

        @Override
        public DockerComposeResult up(Path composeFile, String projectName) {
            upCalled = true;
            if (transitionToStarting) {
                containers = startingContainer();
            }
            return new DockerComposeResult(0, List.of("started " + projectName));
        }

        @Override
        public DockerComposeResult stop(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("stopped " + projectName));
        }

        @Override
        public DockerComposeResult restart(Path composeFile, String projectName) {
            restartCalled = true;
            if (transitionToStarting) {
                containers = startingContainer();
            }
            return new DockerComposeResult(0, List.of("restarted " + projectName));
        }

        @Override
        public DockerComposeResult down(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("removed " + projectName));
        }

        @Override
        public DockerComposeResult ps(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("NAME STATUS", projectName + " running healthy"));
        }

        @Override
        public List<DockerContainerStatus> containers(Path composeFile, String projectName) {
            return containers;
        }

        @Override
        public List<ContainerTelemetry> stats(List<String> containerNames) {
            return List.of(new ContainerTelemetry(
                    "project-os-vaultwarden",
                    "1.25%",
                    "96MiB / 2GiB",
                    "4.8%",
                    "12kB / 5kB",
                    "4MB / 1MB"));
        }

        private List<DockerContainerStatus> startingContainer() {
            return List.of(new DockerContainerStatus(
                    "project-os-vaultwarden",
                    "vaultwarden",
                    "running",
                    "starting",
                    "Up Less than a second (health: starting)",
                    "0.0.0.0:8090->80/tcp"));
        }
    }
}
