package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.backups.BackupRepository;
import com.autarkos.backups.RestorePoint;
import com.autarkos.backups.RestorePoints;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppActionResult;
import com.autarkos.marketplace.install.AppGuardianService;
import com.autarkos.marketplace.install.AppHealthSnapshot;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.AppReliabilityService;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.marketplace.install.DockerComposeExecutor;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.PostInstallGuideBuilder;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.ReliabilityModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.tailscale.TailscaleServeResult;
import com.autarkos.network.tailscale.TailscaleServeConfig;
import com.autarkos.network.tailscale.TailscaleServeMapping;
import com.autarkos.network.tailscale.DevTailscaleService;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.testsupport.RestorePointTestRecords;

class AppLifecycleServiceTests {

    @TempDir
    Path runtimeRoot;

    InstalledAppRepository repository;
    AppLifecycleService service;
    FakeLifecycleDockerComposeExecutor composeExecutor;
    FakeTailscaleService tailscaleService;
    RuntimeLayout runtimeLayout;
    BackupRepository backupRepository;

    @BeforeEach
    void setUp() throws Exception {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        runtimeLayout = new RuntimeLayout(properties);
        repository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        composeExecutor = new FakeLifecycleDockerComposeExecutor();
        tailscaleService = new FakeTailscaleService();
        service = new AppLifecycleService(
                repository,
                composeExecutor,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                () -> List.of(),
                runtimeLayout,
                new PostInstallGuideBuilder(),
                tailscaleService,
                false,
                null,
                backupRepository);
        Path appRoot = runtimeRoot.resolve("apps/vaultwarden");
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services: {}\n");
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", appRoot.toString(), "autark-os-vaultwarden", "http://localhost:8090", Instant.parse("2026-06-11T00:00:00Z")));
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
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
        assertThat(app.managementState()).isEqualTo("managed");
        assertThat(app.readinessState()).isEqualTo("ready");
        assertThat(app.attentionState()).isEqualTo("none");
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
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
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
                .hasMessageContaining("not owned by this Autark-OS instance");
        assertThat(composeExecutor.upCalled).isFalse();
    }

    @Test
    void lifecycleStartFailureExplainsPortConflictInUserLanguage() {
        composeExecutor.failUpOutput = List.of(
                "Error response from daemon: failed to bind host port 0.0.0.0:8385/tcp: address already in use");

        assertThatThrownBy(() -> service.start("vaultwarden"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Port 8385 is already in use")
                .hasMessageContaining("change the app port");
    }

    @Test
    void telemetryForAllAppsUsesAppIdsAsKeys() {
        assertThat(service.telemetry())
                .containsKey("vaultwarden")
                .extractingByKey("vaultwarden")
                .satisfies(telemetry -> assertThat(telemetry.cpuPercent()).isEqualTo("1.25%"));
    }

    @Test
    void appListOnlyIncludesOwnedInstalledApps() throws Exception {
        Path homepageRoot = runtimeRoot.resolve("apps/homepage");
        Files.createDirectories(homepageRoot);
        repository.save(new InstalledApp("homepage", "Homepage", "Ready", homepageRoot.toString(), "autark-os-homepage", "http://localhost:3000", Instant.parse("2026-06-11T00:00:00Z")));
        assertThat(service.listApps())
                .extracting(AppRuntimeView::appId)
                .containsExactly("vaultwarden");
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
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", runtimeRoot.resolve("apps/vaultwarden").toString(), "autark-os-vaultwarden", "http://localhost:8090", Instant.now()));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
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
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
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
    void runtimeViewExposesPausedAndUnreachableApplicationStates() {
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "exited",
                "",
                "Exited 1 minute ago",
                "0.0.0.0:8090->80/tcp"));

        AppRuntimeView paused = service.getApp("vaultwarden");

        assertThat(paused.readinessState()).isEqualTo("paused");
        assertThat(paused.attentionState()).isEqualTo("none");

        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));

        AppRuntimeView unreachable = service.getApp("vaultwarden");

        assertThat(unreachable.readinessState()).isEqualTo("unreachable");
        assertThat(unreachable.attentionState()).isEqualTo("needs_review");
    }

    @Test
    void runtimeViewReconcilesStaleComposeProjectFromRuntimeMetadata() throws Exception {
        Path metadataFile = runtimeRoot.resolve("apps/vaultwarden/autark-os-app.json");
        Files.writeString(metadataFile, """
                {
                  "appInstanceId" : "appinst_vaultwarden_runtime",
                  "catalogAppId" : "vaultwarden",
                  "instanceId" : "pos_test",
                  "composeProject" : "autarkos_dev_postest_vaultwarden",
                  "manifestVersion" : "latest",
                  "createdAt" : "2026-06-11T00:00:00Z"
                }
                """);
        composeExecutor.requiredProjectName = "autarkos_dev_postest_vaultwarden";

        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.friendlyStatus()).isEqualTo("Ready");
        assertThat(app.readinessState()).isEqualTo("ready");
        assertThat(repository.findAppById("vaultwarden")).hasValueSatisfying(saved ->
                assertThat(saved.composeProject()).isEqualTo("autarkos_dev_postest_vaultwarden"));
        assertThat(repository.ownershipFor("vaultwarden")).hasValueSatisfying(ownership ->
                assertThat(ownership.appInstanceId()).isEqualTo("appinst_vaultwarden_runtime"));
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
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
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
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
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
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", runtimeRoot.resolve("apps/vaultwarden").toString(), "autark-os-vaultwarden", "http://localhost:8090", Instant.now()));
        composeExecutor.transitionToStarting = true;
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));
        AppGuardianService guardian = new AppGuardianService(repository, service, true);

        guardian.inspectApp(repository.findAppById("vaultwarden").orElseThrow());

        assertThat(composeExecutor.restartCalled).isTrue();
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().lastRepairStatus()).isEqualTo("guardian_repair_completed");
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .contains("guardian_issue_detected", "guardian_repair_started", "guardian_repair_step_completed", "guardian_repair_completed");
    }

    @Test
    void guardianSkipsAppsWhenAutoRepairIsDisabled() {
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults(),
                "local",
                "optional",
                8090,
                "http",
                null,
                null,
                null,
                null,
                false));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));
        AppGuardianService guardian = new AppGuardianService(repository, service, true);

        guardian.inspectApp(repository.findAppById("vaultwarden").orElseThrow());

        assertThat(composeExecutor.restartCalled).isFalse();
    }

    @Test
    void guardianPersistsBackoffWhenOwnershipBlocksAutomaticRepair() {
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "vaultwarden",
                "",
                "vaultwarden",
                "",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "legacy_unscoped",
                "legacy_unscoped",
                Instant.parse("2026-06-11T00:00:00Z"),
                Instant.parse("2026-06-11T00:00:00Z")));
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults(),
                "local",
                "optional",
                8090,
                "http",
                null,
                null,
                null,
                null,
                true));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));
        AppGuardianService guardian = new AppGuardianService(repository, service, true);

        guardian.inspectApp(repository.findAppById("vaultwarden").orElseThrow());
        guardian.inspectApp(repository.findAppById("vaultwarden").orElseThrow());

        InstallModels.InstallSettings settings = repository.settingsFor("vaultwarden").orElseThrow();
        assertThat(settings.lastRepairAttemptAt()).isNotNull();
        assertThat(settings.lastRepairStatus()).isEqualTo("guardian_repair_blocked");
        assertThat(composeExecutor.restartCalled).isFalse();
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .containsOnlyOnce("guardian_issue_detected");
    }

    @Test
    void reliabilitySummaryHighlightsIssuesAndRepairActivity() {
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));
        service.healthSnapshot("vaultwarden");
        repository.recordEvent("vaultwarden", "guardian_repair_failed", "Docker did not restart the app.");

        ReliabilityModels.AppReliabilitySummary summary = service.reliabilitySummary();

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
    void reliabilityAggregatorReportsAHealthyEmptyManagedAppSet() {
        ReliabilityModels.AppReliabilitySummary summary = new AppReliabilityService(repository, new DevTailscaleService()).summarize(List.of());

        assertThat(summary.posture()).isEqualTo("healthy");
        assertThat(summary.totalApps()).isZero();
        assertThat(summary.issues()).isEmpty();
        assertThat(summary.recentActivity()).isEmpty();
    }

    @Test
    void runtimeViewExposesCanonicalRemediationState() {
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults(),
                "local",
                "optional",
                8090,
                "http",
                null,
                null,
                Instant.parse("2026-06-20T12:05:00Z"),
                "guardian_repair_running",
                true));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));

        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.remediation().state()).isEqualTo("auto_repairing");
        assertThat(app.remediation().label()).isEqualTo("Autark-OS is repairing");
        assertThat(app.remediation().nextActionLabel()).isEqualTo("Wait for repair");
    }

    @Test
    void runtimeViewOnlyRecommendsRestoreWhenCompletedRestorePointExists() {
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of(),
                new InstallModels.BackupPolicy(true, "daily", 7),
                "local",
                "optional",
                8090,
                "http",
                null,
                null,
                Instant.parse("2026-06-20T12:05:00Z"),
                "guardian_repair_failed",
                true));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "unhealthy",
                "Up 1 minute (unhealthy)",
                "0.0.0.0:8090->80/tcp"));

        AppRuntimeView withoutRestorePoint = service.getApp("vaultwarden");

        assertThat(withoutRestorePoint.remediation().state()).isEqualTo("repair_failed");
        assertThat(withoutRestorePoint.remediation().summary()).doesNotContain("restore point");

        RestorePointTestRecords.record(backupRepository, "vaultwarden", "Vaultwarden", "app", "manual", "vaultwarden", "/backups/vaultwarden.zip", "completed", 128, "Backup completed.");

        AppRuntimeView withRestorePoint = service.getApp("vaultwarden");

        assertThat(withRestorePoint.remediation().state()).isEqualTo("restore_recommended");
        assertThat(withRestorePoint.remediation().nextActionLabel()).isEqualTo("Review restore");
    }

    @Test
    void runningContainerIsReadyEvenWhenRawStatusMentionsCreatedTime() {
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
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
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", runtimeRoot.resolve("apps/vaultwarden").toString(), "autark-os-vaultwarden", "https://vault.home", Instant.parse("2026-06-11T00:00:00Z")));

        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.accessUrl()).isEqualTo("http://localhost:8090");
        assertThat(repository.findAppById("vaultwarden").orElseThrow().accessUrl()).isEqualTo("http://localhost:8090");
    }

    @Test
    void refreshCorrectsStaleAccessUrlFromDockerJsonEscapedPorts() {
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", runtimeRoot.resolve("apps/vaultwarden").toString(), "autark-os-vaultwarden", "https://vault.home", Instant.parse("2026-06-11T00:00:00Z")));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
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
                "autark-os-gitea",
                "http://localhost:2222",
                Instant.parse("2026-06-11T00:00:00Z")));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-gitea",
                "gitea",
                "running",
                "",
                "Up 2 minutes",
                "0.0.0.0:2222->22/tcp, 0.0.0.0:3002->3000/tcp"));

        AppRuntimeView app = service.getApp("gitea");

        assertThat(app.accessUrl()).isEqualTo("http://localhost:3002");
        assertThat(repository.findAppById("gitea").orElseThrow().accessUrl()).isEqualTo("http://localhost:3002");
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
                "autark-os-private-worker",
                null,
                Instant.parse("2026-06-11T00:00:00Z")));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-private-worker",
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
                new com.autarkos.network.tailscale.DevTailscaleService(),
                true,
                null,
                backupRepository);
        repository.saveSettings("private-worker", new InstallModels.InstallSettings(
                null,
                "https://autark-os-dev.tailnet.local:12890",
                true,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults(),
                "private",
                "optional",
                8090,
                "http",
                null,
                null,
                null,
                null,
                true));

        AppHealthSnapshot snapshot = devService.healthSnapshot("private-worker");

        assertThat(snapshot.status()).isEqualTo("Ready");
        assertThat(snapshot.privateAccessStatus()).isEqualTo("verified");
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
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                "https://autark-os.example.ts.net:8090",
                true,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults()));

        AppRuntimeView app = service.getApp("vaultwarden");

        assertThat(app.accessRoute().privateLinkStatus()).isEqualTo("port_conflict");
        assertThat(app.accessRoute().primaryOpenUrl()).isEqualTo("http://localhost:8090");
        assertThat(app.accessRoute().privateUrl()).isNull();
    }

    @Test
    void repairRecreatesPrivateAccessWhenStoredPrivateLinkConflictsWithLocalHttpPort() {
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                "https://autark-os.example.ts.net:8090",
                true,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults(),
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
                true,
                null,
                backupRepository);

        AppActionResult result = devService.repair("vaultwarden");

        assertThat(result.status()).isEqualTo("completed");
        assertThat(tailscaleService.lastLocalPort).isEqualTo(8090);
        assertThat(tailscaleService.lastHttpsPort).isNotEqualTo(8090);
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().privateAccessUrl())
                .isEqualTo("https://autark-os.example.ts.net:" + tailscaleService.lastHttpsPort);
    }

    @Test
    void listAppsDoesNotAdoptRediscoveredManagedContainersFromDockerLabels() throws Exception {
        repository.deleteApp("vaultwarden");
        Files.createDirectories(runtimeRoot.resolve("apps/vaultwarden"));
        Files.writeString(runtimeRoot.resolve("apps/vaultwarden/compose.yaml"), "services: {}\n");
        AppLifecycleService rediscoveryService = new AppLifecycleService(
                repository,
                composeExecutor,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                () -> List.of(new RuntimeModels.ManagedContainer("vaultwarden", "autark-os-vaultwarden", "Up 2 minutes (healthy)")),
                runtimeLayout,
                new PostInstallGuideBuilder(),
                new FakeTailscaleService(),
                false,
                null,
                backupRepository);

        List<AppRuntimeView> apps = rediscoveryService.listApps();

        assertThat(apps)
                .extracting(AppRuntimeView::appId)
                .doesNotContain("vaultwarden");
        assertThat(repository.findAppById("vaultwarden")).isEmpty();
    }

    @Test
    void uninstallPlanKeepsDataByDefault() {
        InstallModels.UninstallPlan plan = service.uninstallPlan("vaultwarden");

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
        List<RestorePoint> restorePoints = backupRepository.forApp("vaultwarden", 5).stream()
                .map(RestorePoints::toDomain)
                .toList();
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
    void failedUninstallLeavesAppRecordVisible() {
        composeExecutor.failDown = true;

        assertThatThrownBy(() -> service.uninstall("vaultwarden"))
                .hasMessageContaining("Could not uninstall Vaultwarden");

        assertThat(repository.findAppById("vaultwarden")).isPresent();
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .contains("uninstall_failed");
    }

    @Test
    void updateSettingsPersistsValidatedUserPreferences() {
        AppRuntimeView app = service.updateSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                null,
                true,
                java.util.Map.of(),
                new InstallModels.BackupPolicy(true, "weekly", 14)));

        assertThat(app.settings().tailscaleEnabled()).isTrue();
        assertThat(app.settings().backup().frequency()).isEqualTo("weekly");
        assertThat(repository.eventsFor("vaultwarden", 5))
                .extracting(event -> event.type())
                .contains("settings_updated", "settings_apply_completed");
    }

    @Test
    void privateHttpsCatalogHintNormalizesToRecommendedPrivateAccess() throws Exception {
        Path appRoot = runtimeRoot.resolve("apps/obsidian-livesync");
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services: {}\n");
        repository.save(new InstalledApp(
                "obsidian-livesync",
                "Obsidian LiveSync",
                "Installed",
                appRoot.toString(),
                "autark-os-obsidian-livesync",
                "http://localhost:5984",
                Instant.parse("2026-06-11T00:00:00Z")));
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "obsidian-livesync",
                "appinst_obsidian_livesync",
                "obsidian-livesync",
                "pos_test",
                appRoot.toString(),
                "ready",
                "owned",
                Instant.parse("2026-06-11T00:00:00Z"),
                Instant.parse("2026-06-11T00:00:00Z")));

        AppRuntimeView app = service.updateSettings("obsidian-livesync", new InstallModels.InstallSettings(
                "http://localhost:5984",
                null,
                false,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults()));

        assertThat(app.settings().tailscaleEnabled()).isFalse();
        assertThat(app.settings().privateAccessRequirement()).isEqualTo("recommended");
        assertThat(app.desiredAccess().privateAccessRequirement()).isEqualTo("recommended");
    }

    @Test
    void settingsPlanBlocksStorageFolderChangesUntilMigrationExists() {
        InstallModels.AppSettingsChangePlan plan = service.settingsChangePlan("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of("data", "vault-data"),
                InstallModels.BackupPolicy.defaults()));

        assertThat(plan.saveAllowed()).isFalse();
        assertThat(plan.dataMigrationRequired()).isTrue();
        assertThat(plan.blockedReasons()).anyMatch(reason -> reason.contains("guarded data migration"));
        assertThatThrownBy(() -> service.updateSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of("data", "vault-data"),
                InstallModels.BackupPolicy.defaults())))
                .hasMessageContaining("guarded data migration");
    }

    @Test
    void changingLocalPortRendersComposeAndRestartsApp() throws Exception {
        InstallModels.AppSettingsChangePlan plan = service.settingsChangePlan("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:19090",
                null,
                false,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults()));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 1 second (healthy)",
                "0.0.0.0:19090->80/tcp"));

        AppRuntimeView app = service.updateSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:19090",
                null,
                false,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults()));

        assertThat(plan.redeployRequired()).isTrue();
        assertThat(app.accessUrl()).isEqualTo("http://localhost:19090");
        assertThat(composeExecutor.upCalled).isTrue();
        assertThat(Files.readString(runtimeRoot.resolve("apps/vaultwarden/compose.yaml"))).contains("19090:80");
        assertThat(repository.eventsFor("vaultwarden", 10))
                .extracting(event -> event.type())
                .contains("settings_change_planned", "settings_apply_started", "settings_redeploy_completed", "settings_apply_completed");
    }

    @Test
    void changingLocalPortKeepsOwnedAppVisibleInRuntimeList() {
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 1 second (healthy)",
                "0.0.0.0:19090->80/tcp"));

        service.updateSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:19090",
                null,
                false,
                java.util.Map.of(),
                InstallModels.BackupPolicy.defaults()));

        assertThat(service.listApps())
                .extracting(AppRuntimeView::appId)
                .contains("vaultwarden");
    }

    @Test
    void enablePrivateAccessCreatesTailscaleServeLinkAndPersistsIt() {
        AppActionResult result = service.enablePrivateAccess("vaultwarden");

        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.message()).contains("https://autark-os.example.ts.net:");
        assertThat(tailscaleService.lastLocalPort).isEqualTo(8090);
        assertThat(tailscaleService.lastHttpsPort).isNotEqualTo(8090);
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().tailscaleEnabled()).isTrue();
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().privateAccessUrl()).isEqualTo("https://autark-os.example.ts.net:" + tailscaleService.lastHttpsPort);
        assertThat(result.app().desiredAccess().mode()).isEqualTo("private");
        assertThat(result.app().observedAccess().privateLinkStatus()).isEqualTo("verified");
        assertThat(result.app().accessRoute().primaryOpenUrl()).isEqualTo("https://autark-os.example.ts.net:" + tailscaleService.lastHttpsPort);
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
                "autark-os-obsidian-livesync",
                "http://localhost:5984",
                Instant.parse("2026-06-11T00:00:00Z")));
        composeExecutor.containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-obsidian-livesync",
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

    private static class FakeTailscaleService extends TailscaleService {
        int lastLocalPort;
        int lastHttpsPort;

        @Override
        public TailscaleServeResult serveHttps(int localPort, int httpsPort) {
            lastLocalPort = localPort;
            lastHttpsPort = httpsPort;
            return new TailscaleServeResult(true, "https://autark-os.example.ts.net:" + httpsPort, "Private HTTPS link is ready.", List.of("fake tailscale serve " + localPort));
        }

        @Override
        public TailscaleStatus status() {
            return new TailscaleStatus(true, true, "connected", "Connected", "autark-os", "autark-os.example.ts.net", List.of("100.64.0.1"), "example.ts.net", "owner");
        }

        @Override
        public TailscaleServeConfig serveConfig() {
            if (lastLocalPort == 0 || lastHttpsPort == 0) {
                return new TailscaleServeConfig(true, "available", "No mappings", List.of(), List.of(), Instant.now());
            }
            return new TailscaleServeConfig(
                    true,
                    "available",
                    "Fake mapping",
                    List.of(new TailscaleServeMapping(null, "https://autark-os.example.ts.net:" + lastHttpsPort + "/", lastHttpsPort, "http://127.0.0.1:" + lastLocalPort, lastLocalPort)),
                    List.of(),
                    Instant.now());
        }
    }

    private static class FakeLifecycleDockerComposeExecutor implements DockerComposeExecutor {
        List<RuntimeModels.DockerContainerStatus> containers = List.of(new RuntimeModels.DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 2 minutes (healthy)",
                "0.0.0.0:8090->80/tcp"));
        boolean restartCalled;
        boolean upCalled;
        List<String> failUpOutput = List.of();
        boolean failDown;
        boolean transitionToStarting;
        String requiredProjectName;

        @Override
        public RuntimeModels.DockerComposeResult up(Path composeFile, String projectName) {
            upCalled = true;
            if (!failUpOutput.isEmpty()) {
                return new RuntimeModels.DockerComposeResult(1, failUpOutput);
            }
            if (transitionToStarting) {
                containers = startingContainer();
            }
            return new RuntimeModels.DockerComposeResult(0, List.of("started " + projectName));
        }

        @Override
        public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of("stopped " + projectName));
        }

        @Override
        public RuntimeModels.DockerComposeResult restart(Path composeFile, String projectName) {
            restartCalled = true;
            if (transitionToStarting) {
                containers = startingContainer();
            }
            return new RuntimeModels.DockerComposeResult(0, List.of("restarted " + projectName));
        }

        @Override
        public RuntimeModels.DockerComposeResult down(Path composeFile, String projectName) {
            if (failDown) {
                return new RuntimeModels.DockerComposeResult(1, List.of("failed to remove " + projectName));
            }
            return new RuntimeModels.DockerComposeResult(0, List.of("removed " + projectName));
        }

        @Override
        public RuntimeModels.DockerComposeResult ps(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of("NAME STATUS", projectName + " running healthy"));
        }

        @Override
        public List<RuntimeModels.DockerContainerStatus> containers(Path composeFile, String projectName) {
            if (requiredProjectName != null && !requiredProjectName.equals(projectName)) {
                return List.of();
            }
            return containers;
        }

        @Override
        public List<RuntimeModels.ContainerTelemetry> stats(List<String> containerNames) {
            return List.of(new RuntimeModels.ContainerTelemetry(
                    "autark-os-vaultwarden",
                    "1.25%",
                    "96MiB / 2GiB",
                    "4.8%",
                    "12kB / 5kB",
                    "4MB / 1MB"));
        }

        private List<RuntimeModels.DockerContainerStatus> startingContainer() {
            return List.of(new RuntimeModels.DockerContainerStatus(
                    "autark-os-vaultwarden",
                    "vaultwarden",
                    "running",
                    "starting",
                    "Up Less than a second (health: starting)",
                    "0.0.0.0:8090->80/tcp"));
        }
    }
}
