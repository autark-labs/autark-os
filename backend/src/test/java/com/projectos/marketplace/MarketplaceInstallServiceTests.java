package com.projectos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.catalog.ManifestValidator;
import com.projectos.marketplace.catalog.ManifestYamlReader;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.host.ObservedService;
import com.projectos.host.ObservedServiceRepository;
import com.projectos.host.ObservedServiceScanner;
import com.projectos.host.ObservedServiceService;
import com.projectos.marketplace.install.CatalogPackageCopier;
import com.projectos.marketplace.install.ComposeRenderer;
import com.projectos.marketplace.install.ContainerTelemetry;
import com.projectos.marketplace.install.DockerContainerStatus;
import com.projectos.marketplace.install.DockerComposeExecutor;
import com.projectos.marketplace.install.DockerComposeResult;
import com.projectos.marketplace.install.BackupPolicy;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstallCustomizationResolver;
import com.projectos.marketplace.api.InstallOptionsRequest;
import com.projectos.marketplace.install.InstallResult;
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.InstallStep;
import com.projectos.marketplace.install.AppRuntimeMetadataWriter;
import com.projectos.marketplace.install.DockerOwnershipService;
import com.projectos.marketplace.install.DuplicateInstallAcknowledgementRequiredException;
import com.projectos.marketplace.install.MarketplaceInstallService;
import com.projectos.marketplace.install.PortAllocator;
import com.projectos.marketplace.install.PostInstallGuideBuilder;
import com.projectos.marketplace.install.PostInstallProvisioner;
import com.projectos.marketplace.install.PostInstallProvisioningResult;
import com.projectos.marketplace.install.RuntimeDirectoryManager;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.marketplace.model.RuntimeServiceManifest;
import com.projectos.marketplace.plan.InstallPlanService;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.network.tailscale.TailscaleServeResult;
import com.projectos.network.tailscale.TailscaleService;
import com.projectos.system.ProjectOsIdentity;

class MarketplaceInstallServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void installsAppThroughRuntimeAbstractionsWithoutRealDocker() throws Exception {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        MarketplaceInstallService installService = new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout),
                new FakeDockerComposeExecutor(),
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                new FakeTailscaleService());

        InstallResult result = installService.install(manifest);

        assertThat(result.status()).isEqualTo("installed");
        assertThat(Files.exists(runtimeRoot.resolve("apps/vaultwarden/manifest.yaml"))).isTrue();
        assertThat(Files.exists(runtimeRoot.resolve("apps/vaultwarden/compose.yaml"))).isTrue();
        assertThat(Files.readString(runtimeRoot.resolve("apps/vaultwarden/compose.yaml")))
                .contains("project-os-vaultwarden")
                .contains("8090:80")
                .contains(runtimeRoot.resolve("apps/vaultwarden/data").toString());
        assertThat(repository.findAll())
                .extracting(installedApp -> installedApp.appId())
                .containsExactly("vaultwarden");
    }

    @Test
    void installWritesScopedDockerMetadataForOwnedApps() throws Exception {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        ProjectOsIdentity identity = new ProjectOsIdentity(
                "pos_abcdef1234567890",
                "homelab-box",
                runtimeRoot.toString(),
                "sha256:runtimehash",
                Instant.parse("2026-06-20T12:00:00Z"),
                1);
        DockerOwnershipService ownershipService = new DockerOwnershipService(() -> identity, () -> "0.2.0", false);
        MarketplaceInstallService installService = new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout, ownershipService),
                new FakeDockerComposeExecutor(),
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                new FakeTailscaleService(),
                null,
                ownershipService,
                new AppRuntimeMetadataWriter(() -> identity, () -> Instant.parse("2026-06-20T13:00:00Z")));

        InstallResult result = installService.install(manifest);

        String compose = Files.readString(runtimeRoot.resolve("apps/vaultwarden/compose.yaml"));
        String metadata = Files.readString(runtimeRoot.resolve("apps/vaultwarden/project-os-app.json"));
        assertThat(result.status()).isEqualTo("installed");
        assertThat(repository.findById("vaultwarden").orElseThrow().composeProject()).isEqualTo("projectos_homelab-box_vaultwarden");
        assertThat(repository.ownershipFor("vaultwarden")).hasValueSatisfying(ownership -> {
            assertThat(ownership.appInstanceId()).startsWith("appinst_");
            assertThat(ownership.projectOsInstanceId()).isEqualTo("pos_abcdef1234567890");
            assertThat(ownership.installState()).isEqualTo("ready");
            assertThat(ownership.ownershipStatus()).isEqualTo("owned");
        });
        assertThat(compose)
                .contains("container_name: projectos_homelab-box_vaultwarden")
                .contains("project-os.instance-id=pos_abcdef1234567890")
                .contains("project-os.compose-project=projectos_homelab-box_vaultwarden");
        assertThat(metadata)
                .contains("\"catalogAppId\" : \"vaultwarden\"")
                .contains("\"instanceId\" : \"pos_abcdef1234567890\"")
                .contains("\"composeProject\" : \"projectos_homelab-box_vaultwarden\"");
    }

    @Test
    void installsWithCustomizedSettingsAndPersistsThem() throws Exception {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        FakeTailscaleService tailscaleService = new FakeTailscaleService();
        MarketplaceInstallService installService = new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout),
                new FakeDockerComposeExecutor(),
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                tailscaleService);

        InstallResult result = installService.install(manifest, new InstallOptionsRequest(
                new InstallOptionsRequest.PortOptions(19090),
                new InstallOptionsRequest.AccessOptions(true),
                new InstallOptionsRequest.StorageOptions(java.util.Map.of("data", "vault-data")),
                new InstallOptionsRequest.BackupOptions(true, "weekly", 4)));

        assertThat(result.accessUrl()).isEqualTo("http://localhost:19090");
        assertThat(Files.readString(runtimeRoot.resolve("apps/vaultwarden/compose.yaml")))
                .contains("19090:80")
                .contains(runtimeRoot.resolve("apps/vaultwarden/vault-data").toString());
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().tailscaleEnabled()).isTrue();
        assertThat(tailscaleService.lastLocalPort).isEqualTo(19090);
        assertThat(tailscaleService.lastHttpsPort).isNotEqualTo(19090);
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().privateAccessUrl())
                .isEqualTo("https://project-os.example.ts.net:" + tailscaleService.lastHttpsPort);
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().backup().frequency()).isEqualTo("weekly");
    }

    @Test
    void doesNotReinstallExistingAppWithoutExplicitRequest() throws Exception {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Ready", runtimeRoot.resolve("apps/vaultwarden").toString(), "project-os-vaultwarden", "http://localhost:19090", java.time.Instant.parse("2026-06-11T00:00:00Z")));
        repository.saveSettings("vaultwarden", new InstallSettings("http://localhost:19090", "https://vault.tailnet.ts.net", true, java.util.Map.of("data", "vault-data"), new BackupPolicy(true, "weekly", 4)));
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        MarketplaceInstallService installService = new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout),
                new FakeDockerComposeExecutor(),
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                new FakeTailscaleService());

        InstallResult result = installService.install(manifest);

        assertThat(result.status()).isEqualTo("already_installed");
        assertThat(result.accessUrl()).isEqualTo("http://localhost:19090");
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().backup().frequency()).isEqualTo("weekly");
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().storageSubfolders()).containsEntry("data", "vault-data");
    }

    @Test
    void explicitlyReinstallsExistingApp() throws Exception {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Ready", runtimeRoot.resolve("apps/vaultwarden").toString(), "project-os-vaultwarden", "http://localhost:19090", java.time.Instant.parse("2026-06-11T00:00:00Z")));
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        MarketplaceInstallService installService = new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout),
                new FakeDockerComposeExecutor(),
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                new FakeTailscaleService());

        InstallResult result = installService.install(manifest, new InstallOptionsRequest(
                new InstallOptionsRequest.PortOptions(19090),
                new InstallOptionsRequest.AccessOptions(true),
                new InstallOptionsRequest.StorageOptions(java.util.Map.of("data", "vault-data")),
                new InstallOptionsRequest.BackupOptions(true, "weekly", 4),
                true));

        assertThat(result.status()).isEqualTo("installed");
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().tailscaleEnabled()).isTrue();
        assertThat(repository.settingsFor("vaultwarden").orElseThrow().backup().frequency()).isEqualTo("weekly");
    }

    @Test
    void failsInstallWhenContainerDoesNotBecomeReady() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        MarketplaceInstallService installService = new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout),
                new FakeDockerComposeExecutor(List.of(new DockerContainerStatus("project-os-vaultwarden", "vaultwarden", "exited", "", "Exited (1) 2 seconds ago", ""))),
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                new FakeTailscaleService());

        InstallResult result = installService.install(manifest);

        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.message()).contains("stopped or reported unhealthy");
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    void failedInstallAfterComposeStartsRecordsVisibleFailedInstallWithoutBlockingNextInstallAttempt() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        ObservedServiceRepository observedRepository = new ObservedServiceRepository(runtimeLayout);
        MarketplaceInstallService failedInstallService = installService(
                runtimeLayout,
                repository,
                observedRepository,
                null,
                new FakeDockerComposeExecutor(List.of(new DockerContainerStatus("project-os-vaultwarden", "vaultwarden", "exited", "", "Exited (1) 2 seconds ago", ""))));

        InstallResult failedResult = failedInstallService.install(manifest);

        assertThat(failedResult.status()).isEqualTo("failed");
        assertThat(repository.findById("vaultwarden")).isEmpty();
        assertThat(observedRepository.findAll())
                .singleElement()
                .satisfies(service -> {
                    assertThat(service.catalogAppId()).isEqualTo("vaultwarden");
                    assertThat(service.ownershipState()).isEqualTo("failed_install");
                    assertThat(service.runtimeState()).isEqualTo("failed");
                    assertThat(service.displayName()).isEqualTo("Vaultwarden");
                    assertThat(service.metadataJson()).contains("stopped or reported unhealthy");
                });

        MarketplaceInstallService successfulInstallService = installService(
                runtimeLayout,
                repository,
                observedRepository,
                null,
                new FakeDockerComposeExecutor());

        InstallResult successfulResult = successfulInstallService.install(manifest);

        assertThat(successfulResult.status()).isEqualTo("installed");
        assertThat(repository.findById("vaultwarden")).isPresent();
        assertThat(observedRepository.findAll()).isEmpty();
    }

    @Test
    void installsWhenContainerIsRunningButHealthCheckIsStillStarting() throws Exception {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        MarketplaceInstallService installService = new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout),
                new FakeDockerComposeExecutor(List.of(new DockerContainerStatus("project-os-vaultwarden", "vaultwarden", "running", "starting", "Up 20 seconds (health: starting)", "0.0.0.0:8090->80/tcp"))),
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                new FakeTailscaleService());

        InstallResult result = installService.install(manifest);

        assertThat(result.status()).isEqualTo("installed");
        assertThat(result.steps())
                .anySatisfy(step -> {
                    assertThat(step.label()).isEqualTo("Checking app health");
                    assertThat(step.detail()).contains("still finishing startup checks");
                });
        assertThat(repository.findById("vaultwarden").orElseThrow().status()).isEqualTo("Starting");
    }

    @Test
    void rendersRequiredEnvironmentForObsidianLiveSync() throws Exception {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("obsidian-livesync").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        MarketplaceInstallService installService = new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout),
                new FakeDockerComposeExecutor(List.of(new DockerContainerStatus("project-os-obsidian-livesync", "obsidian-livesync", "running", "", "Up 2 minutes", "0.0.0.0:5984->5984/tcp"))),
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                new FakeTailscaleService());

        InstallResult result = installService.install(manifest);

        assertThat(result.status()).isEqualTo("installed");
        assertThat(Files.readString(runtimeRoot.resolve("apps/obsidian-livesync/compose.yaml")))
                .contains("127.0.0.1:5984:5984")
                .contains("COUCHDB_USER=projectos")
                .contains("COUCHDB_PASSWORD=projectos-change-me")
                .contains("COUCHDB_SECRET=project-os-obsidian-livesync");
        assertThat(result.postInstallGuide()).isNotNull();
        assertThat(result.postInstallGuide().values())
                .anySatisfy(value -> {
                    assertThat(value.label()).isEqualTo("Database");
                    assertThat(value.value()).isEqualTo("obsidian");
                });
    }

    @Test
    void rendersMultiServiceComposeForPaperless() throws Exception {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("paperless-ngx").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        MarketplaceInstallService installService = new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout),
                new FakeDockerComposeExecutor(List.of(
                        new DockerContainerStatus("project-os-paperless-ngx-web", "web", "running", "healthy", "Up 2 minutes (healthy)", "0.0.0.0:8010->8000/tcp"),
                        new DockerContainerStatus("project-os-paperless-ngx-broker", "broker", "running", "", "Up 2 minutes", ""),
                        new DockerContainerStatus("project-os-paperless-ngx-db", "db", "running", "", "Up 2 minutes", ""))),
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                new FakeTailscaleService());

        InstallResult result = installService.install(manifest);
        String compose = Files.readString(runtimeRoot.resolve("apps/paperless-ngx/compose.yaml"));

        assertThat(result.status()).isEqualTo("installed");
        assertThat(result.plan().technical().containers()).hasSize(3);
        assertThat(compose)
                .contains("  web:")
                .contains("container_name: project-os-paperless-ngx-web")
                .contains("  broker:")
                .contains("container_name: project-os-paperless-ngx-broker")
                .contains("  db:")
                .contains("container_name: project-os-paperless-ngx-db")
                .contains("depends_on:")
                .contains("PAPERLESS_DBHOST=db")
                .contains("POSTGRES_DB=paperless")
                .contains("8010:8000")
                .contains(runtimeRoot.resolve("apps/paperless-ngx/postgres").toString());
    }

    @Test
    void duplicateObservedServiceWithoutAcknowledgementFailsBeforeInstall() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        ObservedServiceRepository observedRepository = new ObservedServiceRepository(runtimeLayout);
        observedRepository.upsert(observed("docker:vaultwarden", "vaultwarden", "external_docker", "observed"));
        MarketplaceInstallService installService = installService(runtimeLayout, repository, observedRepository, null);

        InstallResult result = installService.install(manifest, InstallOptionsRequest.defaults());

        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.message()).contains("already sees Vaultwarden");
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    void duplicatePreflightRejectionUsesActionableException() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        ObservedServiceRepository observedRepository = new ObservedServiceRepository(runtimeLayout);
        observedRepository.upsert(observed("docker:vaultwarden", "vaultwarden", "external_docker", "observed"));
        MarketplaceInstallService installService = installService(runtimeLayout, new InstalledAppRepository(runtimeLayout), observedRepository, null);

        assertThatThrownBy(() -> installService.ensureDuplicateAcknowledgement(manifest, InstallOptionsRequest.defaults()))
                .isInstanceOf(DuplicateInstallAcknowledgementRequiredException.class)
                .hasMessageContaining("already sees Vaultwarden");
    }

    @Test
    void duplicateObservedServiceWithAcknowledgementProceeds() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        ObservedServiceRepository observedRepository = new ObservedServiceRepository(runtimeLayout);
        observedRepository.upsert(observed("docker:vaultwarden", "vaultwarden", "external_docker", "observed"));
        MarketplaceInstallService installService = installService(runtimeLayout, repository, observedRepository, null);

        InstallResult result = installService.install(manifest, new InstallOptionsRequest(null, null, null, null, false, true));

        assertThat(result.status()).isEqualTo("installed");
        assertThat(repository.findAll()).extracting(InstalledApp::appId).contains("vaultwarden");
    }

    @Test
    void recoverableProjectOsServiceBlocksDuplicateInstallEvenWithAcknowledgement() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        ObservedServiceRepository observedRepository = new ObservedServiceRepository(runtimeLayout);
        observedRepository.upsert(observed("docker:project-os-vaultwarden", "vaultwarden", "legacy_project_os", "observed"));
        MarketplaceInstallService installService = installService(runtimeLayout, repository, observedRepository, null);

        InstallResult result = installService.install(manifest, new InstallOptionsRequest(null, null, null, null, false, true));

        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.message()).contains("recover the existing Vaultwarden service");
        assertThat(repository.findById("vaultwarden")).isEmpty();
    }

    @Test
    void installFailsWhenOwnershipDoesNotReconcileToManaged() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        ApplicationManifest manifest = catalogService.findById("vaultwarden").orElseThrow();
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout);
        MarketplaceInstallService installService = installService(
                runtimeLayout,
                repository,
                new ObservedServiceRepository(runtimeLayout),
                new AppRuntimeMetadataWriter(
                        () -> new ProjectOsIdentity("current-instance", "project-os", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1),
                        () -> Instant.parse("2026-06-20T13:00:00Z")));

        InstallResult result = installService.install(manifest);

        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.message()).contains("could not confirm that this app is managed by this installation");
        assertThat(repository.findById("vaultwarden")).isEmpty();
        assertThat(repository.ownershipFor("vaultwarden")).isEmpty();
        assertThat(repository.settingsFor("vaultwarden")).isEmpty();
    }

    private MarketplaceInstallService installService(
            RuntimeLayout runtimeLayout,
            InstalledAppRepository repository,
            ObservedServiceRepository observedRepository,
            AppRuntimeMetadataWriter metadataWriter) {
        return installService(runtimeLayout, repository, observedRepository, metadataWriter, new FakeDockerComposeExecutor());
    }

    private MarketplaceInstallService installService(
            RuntimeLayout runtimeLayout,
            InstalledAppRepository repository,
            ObservedServiceRepository observedRepository,
            AppRuntimeMetadataWriter metadataWriter,
            DockerComposeExecutor dockerComposeExecutor) {
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new FixedPortAllocator());
        ObservedServiceService observedService = new ObservedServiceService(
                observedRepository,
                new ObservedServiceScanner(List::of, () -> new ProjectOsIdentity("current-instance", "project-os", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1)));
        return new MarketplaceInstallService(
                new InstallPlanService(runtimeLayout, customizationResolver),
                new RuntimeDirectoryManager(runtimeLayout),
                new CatalogPackageCopier(),
                new ComposeRenderer(runtimeLayout),
                dockerComposeExecutor,
                repository,
                customizationResolver,
                new FakePostInstallProvisioner(),
                new PostInstallGuideBuilder(),
                new FakeTailscaleService(),
                null,
                null,
                metadataWriter,
                observedService);
    }

    private ObservedService observed(String id, String catalogAppId, String ownershipState, String visibility) {
        Instant seenAt = Instant.parse("2026-06-21T12:00:00Z");
        return new ObservedService(
                id,
                "docker",
                id.replace("docker:", ""),
                catalogAppId,
                "http://localhost:8090",
                "External",
                "LAN",
                catalogAppId,
                "user",
                ownershipState,
                visibility,
                "running",
                false,
                "",
                seenAt,
                seenAt,
                "pinned".equals(visibility) ? seenAt : null,
                null,
                "{}");
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static class FakeDockerComposeExecutor implements DockerComposeExecutor {
        private final List<DockerContainerStatus> containers;

        private FakeDockerComposeExecutor() {
            this(List.of(new DockerContainerStatus("project-os-vaultwarden", "vaultwarden", "running", "healthy", "Up 2 minutes (healthy)", "0.0.0.0:8090->80/tcp")));
        }

        private FakeDockerComposeExecutor(List<DockerContainerStatus> containers) {
            this.containers = containers;
        }

        @Override
        public DockerComposeResult up(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("fake docker compose up " + projectName));
        }

        @Override
        public DockerComposeResult stop(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("fake docker compose stop " + projectName));
        }

        @Override
        public DockerComposeResult restart(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("fake docker compose restart " + projectName));
        }

        @Override
        public DockerComposeResult down(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("fake docker compose down " + projectName));
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
            return List.of();
        }
    }

    private static class FixedPortAllocator extends PortAllocator {
        @Override
        public List<String> resolvePorts(ApplicationManifest manifest, com.projectos.marketplace.api.InstallOptionsRequest.PortOptions options) {
            return resolveServicePorts(manifest, options).values().stream().flatMap(List::stream).toList();
        }

        @Override
        public Map<String, List<String>> resolveServicePorts(ApplicationManifest manifest, com.projectos.marketplace.api.InstallOptionsRequest.PortOptions options) {
            if (!manifest.runtime().multiService()) {
                return Map.of(manifest.runtime().containerName(), fixedPorts(manifest.runtime().ports(), options));
            }
            Map<String, List<String>> ports = new LinkedHashMap<>();
            boolean explicitApplied = false;
            for (RuntimeServiceManifest service : manifest.runtime().services()) {
                if (options != null && options.hostPort() != null && !explicitApplied && !service.ports().isEmpty()) {
                    ports.put(service.name(), fixedPorts(service.ports(), options));
                    explicitApplied = true;
                } else {
                    ports.put(service.name(), service.ports());
                }
            }
            return ports;
        }

        private List<String> fixedPorts(List<String> ports, com.projectos.marketplace.api.InstallOptionsRequest.PortOptions options) {
            if (options != null && options.hostPort() != null) {
                String containerPort = ports.isEmpty() ? "80" : ports.get(0).split(":", 2)[1];
                return List.of(options.hostPort() + ":" + containerPort);
            }
            return ports;
        }
    }

    private static class FakePostInstallProvisioner extends PostInstallProvisioner {
        @Override
        public PostInstallProvisioningResult provision(ApplicationManifest manifest, String accessUrl) {
            if ("obsidian-livesync".equals(manifest.id())) {
                return new PostInstallProvisioningResult(
                        List.of(InstallStep.completed("Preparing Obsidian sync", "Created the sync database.")),
                        List.of("fake post-install provisioning"),
                        java.util.Map.of(
                                "username", "projectos",
                                "password", "projectos-change-me",
                                "database", "obsidian"));
            }
            return PostInstallProvisioningResult.empty();
        }
    }

    private static class FakeTailscaleService extends TailscaleService {
        int lastLocalPort;
        int lastHttpsPort;

        @Override
        public TailscaleServeResult serveHttps(int localPort) {
            return serveHttps(localPort, localPort);
        }

        @Override
        public TailscaleServeResult serveHttps(int localPort, int httpsPort) {
            lastLocalPort = localPort;
            lastHttpsPort = httpsPort;
            return new TailscaleServeResult(true, "https://project-os.example.ts.net:" + httpsPort, "Private HTTPS link is ready.", List.of("fake tailscale serve " + localPort));
        }
    }
}
