package com.autarkos.discover;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.apps.ApplicationRelationship;
import com.autarkos.apps.ApplicationState;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceRepository;
import com.autarkos.host.ObservedServiceScanner;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstallCustomizationResolver;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.MarketplaceInstallService;
import com.autarkos.marketplace.install.PortAllocator;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.plan.InstallPlanService;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class DiscoverServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void simpleCatalogOffersOnlyManagedStorageAndRejectsStaleExternalFolderChoices() throws Exception {
        var service = discoverService(observedRepository());
        var media = Files.createDirectory(runtimeRoot.resolve("external-media"));
        for (String appId : List.of("jellyfin", "navidrome")) {
            var preview = service.installPreview(appId, new DiscoverSetupModels.DiscoverSetupAnswersRequest(Map.of(
                    "storageMode", "existing_folder",
                    "jellyfinMediaFolder", "existing_folder",
                    "jellyfinExistingMediaPath", media.toString())));
            assertThat(preview.valid()).as(appId).isFalse();
            assertThat(preview.blockingIssues()).extracting(DiscoverInstallModels.DiscoverInstallIssue::fieldId)
                    .contains("storageMode");
            assertThat(service.setupSchema(appId).inputs()).filteredOn(input -> input.id().equals("storageMode"))
                    .singleElement().satisfies(input -> assertThat(input.options())
                            .extracting(DiscoverSetupModels.DiscoverSetupOption::value).containsExactly("autark_os_default"));
        }
        assertThat(service.setupSchema("jellyfin").inputs()).extracting(DiscoverSetupModels.DiscoverSetupInput::id)
                .doesNotContain("jellyfinExistingMediaPath");
    }

    @Test
    void httpsRequiredAppsRejectServerOnlyInsteadOfSilentlyEnablingPrivateAccess() {
        var service = discoverService(observedRepository());
        for (String appId : List.of("actual-budget", "vaultwarden")) {
            var preview = service.installPreview(appId, new DiscoverSetupModels.DiscoverSetupAnswersRequest(
                    Map.of("accessMode", "local_only")));
            assertThat(preview.valid()).as(appId).isFalse();
            assertThat(preview.blockingIssues()).extracting(DiscoverInstallModels.DiscoverInstallIssue::fieldId)
                    .contains("accessMode");
            assertThat(service.setupSchema(appId).inputs()).filteredOn(input -> input.id().equals("accessMode"))
                    .singleElement().satisfies(input -> assertThat(input.options())
                            .extracting(DiscoverSetupModels.DiscoverSetupOption::value).containsExactly("private_only"));
        }
    }

    @Test
    void returnsMergedDiscoverCardsWithoutShowingForeignAppsAsInstalled() throws Exception {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("docker:autarkos_other_jellyfin", "jellyfin", "foreign_autark_os", "observed"));
        DiscoverService service = discoverService(observedRepository);
        InstalledAppRepository repository = repository();
        repository.save(new InstalledApp(
                "vaultwarden",
                "Family Passwords",
                "Ready",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "autark-os-vaultwarden",
                "http://localhost:8090",
                Instant.parse("2026-06-21T12:00:00Z")));
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "vaultwarden",
                "appinst_vaultwarden",
                "vaultwarden",
                "current-instance",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "installed",
                "owned",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z")));
        Files.createDirectories(runtimeRoot.resolve("apps/vaultwarden"));
        Files.writeString(runtimeRoot.resolve("apps/vaultwarden/compose.yaml"), "services: {}\n");

        List<DiscoverAppView> apps = service.apps();

        assertThat(apps).filteredOn(app -> app.application().id().equals("vaultwarden"))
                .singleElement()
                .satisfies(app -> {
                    assertThat(app.application().relationship()).isEqualTo(ApplicationRelationship.MANAGED);
                    assertThat(app.application().primaryAction().id()).isEqualTo("manage");
                    assertThat(app.application().statusTone()).isEqualTo("success");
                    assertThat(app.application().cardTone()).isEqualTo("success");
                });
        assertThat(apps).filteredOn(app -> app.application().id().equals("jellyfin"))
                .singleElement()
                .satisfies(app -> {
                    assertThat(app.application().relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
                    assertThat(app.application().relationshipLabel()).isEqualTo("Blocked");
                    assertThat(app.application().primaryAction().id()).isEqualTo("review_existing");
                    assertThat(app.application().statusTone()).isEqualTo("danger");
                    assertThat(app.application().cardTone()).isEqualTo("danger");
                    assertThat(app.application().availableActions()).extracting(com.autarkos.apps.ApplicationAction::id).contains("review_existing");
                    assertThat(app.application().availableActions()).extracting(com.autarkos.apps.ApplicationAction::id).doesNotContain("recover", "install_copy");
                    assertThat(app.application().runtime()).isNull();
                    assertThat(app.application().evidence()).isNotNull();
                    assertThat(app.application().evidence().summary()).contains("remain unchanged during beta");
                });
    }

    @Test
    void discoverNeverReturnsAvailableForMatchedObservedService() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("docker:vaultwarden", "vaultwarden", "external_docker", "observed"));
        DiscoverService service = discoverService(observedRepository);

        DiscoverAppView app = service.app("vaultwarden").orElseThrow();

        assertThat(app.application().relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(app.application().cardTone()).isEqualTo("danger");
        assertThat(app.application().relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
    }

    @Test
    void buildsCommonAndAppSpecificSetupSchemaFromBackend() {
        DiscoverService service = discoverService(observedRepository());

        DiscoverSetupModels.DiscoverSetupSchema schema = service.setupSchema("jellyfin");

        assertThat(schema.inputs()).extracting(DiscoverSetupModels.DiscoverSetupInput::id)
                .contains("displayName", "accessMode", "storageMode", "backupPolicy", "localBrowserPort", "jellyfinMediaFolder")
                .doesNotContain("jellyfinExistingMediaPath");
        assertThat(schema.inputs()).filteredOn(input -> input.id().equals("accessMode"))
                .singleElement()
                .satisfies(input -> {
                    assertThat(input.tier()).isEqualTo("recommended");
                    assertThat(input.help()).contains("where the app can be opened");
                    assertThat(input.defaultValue()).isEqualTo("private_lan");
                });
    }

    @Test
    void installPreviewValidatesSetupAnswersAndUsesThemInPlainEnglishPlan() throws Exception {
        DiscoverService service = discoverService(observedRepository());

        DiscoverInstallModels.DiscoverInstallPreview invalid = service.installPreview("jellyfin", new DiscoverSetupModels.DiscoverSetupAnswersRequest(Map.of(
                "displayName", "Family Movies",
                "accessMode", "lan_only",
                "storageMode", "autark_os_default",
                "backupPolicy", "disabled",
                "localBrowserPort", "auto",
                "jellyfinMediaFolder", "existing_folder",
                "jellyfinExistingMediaPath", runtimeRoot.resolve("missing").toString())));

        assertThat(invalid.valid()).isFalse();
        assertThat(invalid.blockingIssues()).extracting(DiscoverInstallModels.DiscoverInstallIssue::fieldId)
                .containsExactly("jellyfinMediaFolder");

        DiscoverInstallModels.DiscoverInstallPreview valid = service.installPreview("jellyfin", new DiscoverSetupModels.DiscoverSetupAnswersRequest(Map.of(
                "displayName", "Family Movies",
                "accessMode", "lan_only",
                "storageMode", "autark_os_default",
                "backupPolicy", "disabled",
                "localBrowserPort", 19096,
                "jellyfinMediaFolder", "create_new")));

        assertThat(valid.valid()).isTrue();
        assertThat(valid.sections()).filteredOn(section -> section.id().equals("connect"))
                .singleElement()
                .extracting(DiscoverInstallModels.DiscoverInstallPreviewSection::items)
                .asList()
                .anySatisfy(item -> assertThat(((DiscoverInstallModels.DiscoverInstallPreviewItem) item).label()).contains("home network"));
        assertThat(valid.sections()).filteredOn(section -> section.id().equals("protect"))
                .singleElement()
                .extracting(DiscoverInstallModels.DiscoverInstallPreviewSection::items)
                .asList()
                .anySatisfy(item -> assertThat(((DiscoverInstallModels.DiscoverInstallPreviewItem) item).tone()).isEqualTo("warning"));
        assertThat(valid.installOptions().ports().hostPort()).isEqualTo(19096);
        assertThat(valid.installOptions().backup().enabled()).isFalse();
        assertThat(valid.installOptions().storage().hostPaths()).isEmpty();
        assertThat(valid.technicalDetails().technical().volumes())
                .anySatisfy(volume -> assertThat(volume).isEqualTo(runtimeRoot.resolve("apps/jellyfin/media") + ":/media"));
    }

    @Test
    void setupAnswersArePersistedWithInstallIntent() {
        DiscoverSetupRepository setupRepository = JpaTestRepositories.discoverSetupRepository(runtimeLayout());
        DiscoverSetupModels.DiscoverSetupAnswers answers = new DiscoverSetupModels.DiscoverSetupAnswers(Map.of(
                "displayName", "Family Passwords",
                "accessMode", "private_only",
                "storageMode", "autark_os_default",
                "backupPolicy", "enabled_first_checkpoint",
                "localBrowserPort", "auto"));

        setupRepository.save("vaultwarden", "vaultwarden", answers);

        assertThat(setupRepository.recordByAppId("vaultwarden")).hasValueSatisfying(record -> {
            assertThat(record.displayName()).isEqualTo("Family Passwords");
            assertThat(record.accessMode()).isEqualTo("private_only");
            assertThat(record.backupPolicy()).isEqualTo("enabled_first_checkpoint");
            assertThat(record.answers().values()).containsEntry("displayName", "Family Passwords");
        });
    }

    @Test
    void invalidInstallChoicesNeverCreateAJobOrPersistSetup() throws Exception {
        var installService = new RecordingMarketplaceInstallService();
        var jobs = jobService();
        var service = discoverService(observedRepository(), installService, jobs);
        var request = new DiscoverInstallModels.DiscoverInstallRequest(Map.of(
                "jellyfinMediaFolder", "existing_folder",
                "jellyfinExistingMediaPath", Files.createDirectory(runtimeRoot.resolve("existing-media")).toString()), false, false);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.install("jellyfin", request))
                .isInstanceOf(IllegalArgumentException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.install("vaultwarden",
                new DiscoverInstallModels.DiscoverInstallRequest(Map.of("accessMode", "local_only"), false, false)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("private HTTPS");

        assertThat(jobs.list()).isEmpty();
        jobs.runQueuedJobsNow();
        assertThat(installService.lastOptions).isNull();
        assertThat(JpaTestRepositories.discoverSetupRepository(runtimeLayout()).recordByAppId("jellyfin")).isEmpty();
        assertThat(JpaTestRepositories.discoverSetupRepository(runtimeLayout()).recordByAppId("vaultwarden")).isEmpty();
    }

    @Test
    void installRetriesJoinOnlyMatchingChoicesAndNeverPersistRejectedChoices() {
        var installService = new RecordingMarketplaceInstallService();
        var jobs = jobService();
        var service = discoverService(observedRepository(), installService, jobs);
        var firstRequest = new DiscoverInstallModels.DiscoverInstallRequest(Map.of("displayName", "Original name"), false, true);
        var first = service.install("vaultwarden", firstRequest);
        assertThat(service.install("vaultwarden", firstRequest).jobId()).isEqualTo(first.jobId());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.install("vaultwarden",
                new DiscoverInstallModels.DiscoverInstallRequest(Map.of("displayName", "Rejected name"), false, true)))
                .isInstanceOf(com.autarkos.jobs.JobConflictException.class);
        assertThat(JpaTestRepositories.discoverSetupRepository(runtimeLayout()).recordByAppId("vaultwarden")).isEmpty();
        jobs.runQueuedJobsNow();
        assertThat(JpaTestRepositories.discoverSetupRepository(runtimeLayout()).recordByAppId("vaultwarden"))
                .hasValueSatisfying(record -> assertThat(record.displayName()).isEqualTo("Original name"));
        assertThat(jobs.list()).hasSize(1);
    }

    @Test
    void installPassesDuplicateAcknowledgementToMarketplaceInstall() {
        RecordingMarketplaceInstallService installService = new RecordingMarketplaceInstallService();
        AutarkOsJobService jobService = jobService();
        DiscoverService service = discoverService(observedRepository(), installService, jobService);

        service.install("vaultwarden", new DiscoverInstallModels.DiscoverInstallRequest(Map.of(), false, true));
        jobService.runQueuedJobsNow();

        assertThat(installService.lastOptions).isNotNull();
        assertThat(installService.lastOptions.duplicateAcknowledgedRequested()).isTrue();
    }

    @Test
    void installPersistsSetupAnswersOnlyAfterItsJobIsAcceptedAndRuns() {
        RuntimeLayout layout = runtimeLayout();
        DiscoverSetupRepository setupRepository = JpaTestRepositories.discoverSetupRepository(layout);
        DiscoverSetupService setupService = new DiscoverSetupService(setupRepository);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new PortAllocator());
        AutarkOsJobService jobs = jobService();
        DiscoverService service = new DiscoverService(
                catalogService(),
                applicationStateService(List::of),
                setupService,
                new DiscoverInstallPreviewService(new InstallPlanService(layout, customizationResolver), setupService),
                new RecordingMarketplaceInstallService(),
                jobs);

        service.install("vaultwarden", new DiscoverInstallModels.DiscoverInstallRequest(Map.of(
                "displayName", "Family Passwords",
                "accessMode", "private_only",
                "storageMode", "autark_os_default",
                "backupPolicy", "enabled_first_checkpoint",
                "localBrowserPort", "auto"), false, true));

        assertThat(setupRepository.recordByAppId("vaultwarden")).isEmpty();
        jobs.runQueuedJobsNow();
        assertThat(setupRepository.recordByAppId("vaultwarden")).hasValueSatisfying(record -> {
            assertThat(record.displayName()).isEqualTo("Family Passwords");
            assertThat(record.accessMode()).isEqualTo("private_only");
            assertThat(record.backupPolicy()).isEqualTo("enabled_first_checkpoint");
        });
    }

    @Test
    void installInvalidatesApplicationStateWhenJobIsAccepted() {
        RuntimeLayout layout = runtimeLayout();
        DiscoverSetupRepository setupRepository = JpaTestRepositories.discoverSetupRepository(layout);
        DiscoverSetupService setupService = new DiscoverSetupService(setupRepository);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new PortAllocator());
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        when(applicationStateService.snapshot()).thenReturn(new ApplicationState(
                List.of(), Instant.parse("2026-06-21T12:00:00Z")));
        DiscoverService service = new DiscoverService(
                catalogService(),
                applicationStateService,
                setupService,
                new DiscoverInstallPreviewService(new InstallPlanService(layout, customizationResolver), setupService),
                new RecordingMarketplaceInstallService(),
                jobService());

        service.install("vaultwarden", new DiscoverInstallModels.DiscoverInstallRequest(Map.of(), false, true));

        verify(applicationStateService).invalidate();
    }

    private DiscoverService discoverService(ObservedServiceRepository observedRepository) {
        RuntimeLayout layout = runtimeLayout();
        InstalledAppRepository installedAppRepository = repository();
        DiscoverSetupRepository setupRepository = JpaTestRepositories.discoverSetupRepository(layout);
        DiscoverSetupService setupService = new DiscoverSetupService(setupRepository);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new PortAllocator());
        return new DiscoverService(
                catalogService(),
                applicationStateService(() -> applicationViews(installedAppRepository, observedRepository)),
                setupService,
                new DiscoverInstallPreviewService(new InstallPlanService(layout, customizationResolver), setupService),
                mock(MarketplaceInstallService.class),
                mock(AutarkOsJobService.class));
    }

    private DiscoverService discoverService(ObservedServiceRepository observedRepository, MarketplaceInstallService installService, AutarkOsJobService jobService) {
        RuntimeLayout layout = runtimeLayout();
        InstalledAppRepository installedAppRepository = repository();
        DiscoverSetupRepository setupRepository = JpaTestRepositories.discoverSetupRepository(layout);
        DiscoverSetupService setupService = new DiscoverSetupService(setupRepository);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new PortAllocator());
        return new DiscoverService(
                catalogService(),
                applicationStateService(() -> applicationViews(installedAppRepository, observedRepository)),
                setupService,
                new DiscoverInstallPreviewService(new InstallPlanService(layout, customizationResolver), setupService),
                installService,
                jobService);
    }

    private ApplicationStateService applicationStateService(
            java.util.function.Supplier<List<com.autarkos.apps.ApplicationView>> applications) {
        ApplicationStateService service = mock(ApplicationStateService.class);
        when(service.snapshot()).thenAnswer(ignored -> new ApplicationState(
                applications.get(), Instant.parse("2026-06-21T12:00:00Z")));
        return service;
    }

    private List<com.autarkos.apps.ApplicationView> applicationViews(InstalledAppRepository installedAppRepository, ObservedServiceRepository observedRepository) {
        com.autarkos.system.AutarkOsIdentity identity = new com.autarkos.system.AutarkOsIdentity(
                "current-instance", "autark-os", runtimeRoot.toString(), "runtime-hash",
                Instant.parse("2026-06-20T12:00:00Z"), 1);
        ObservedServiceService observedServices = new ObservedServiceService(observedRepository,
                new ObservedServiceScanner());
        var managedApps = com.autarkos.testsupport.ManagedAppTestContract.service(
                installedAppRepository, runtimeLayout(), identity);
        com.autarkos.testsupport.ManagedAppTestContract.writeAll(installedAppRepository, runtimeLayout(), identity);
        var runtimes = installedAppRepository.findAllApps().stream()
                .filter(app -> managedApps.attest(app).managed())
                .map(this::runtime)
                .toList();
        return new com.autarkos.apps.ApplicationInventoryService(
                catalogService(), installedAppRepository, managedApps,
                mock(com.autarkos.apps.recovery.AppRecoveryService.class))
                .apps(observedServices.observedServices(), runtimes, Map.of());
    }

    private com.autarkos.marketplace.install.AppRuntimeView runtime(InstalledApp app) {
        return new com.autarkos.marketplace.install.AppRuntimeView(
                app.appId(), app.appName(), "Apps", app.appName() + " app", "1.0.0", "", com.autarkos.apps.ApplicationRuntimeState.READY,
                app.runtimePath(), app.composeProject(), app.accessUrl(), null, null, null,
                app.installedAt(), "Backups disabled", "backup_disabled", null, null, null, null, null, List.of(), null, List.of());
    }

    private MarketplaceCatalogService catalogService() {
        return new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
    }

    private InstalledAppRepository repository() {
        return JpaTestRepositories.installedAppRepository(runtimeLayout());
    }

    private ObservedServiceRepository observedRepository() {
        return JpaTestRepositories.observedServiceRepository(runtimeLayout());
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private AutarkOsJobService jobService() {
        return new AutarkOsJobService(JpaTestRepositories.jobRepository(runtimeLayout()), Runnable::run, false);
    }

    private ObservedService observed(String id, String catalogAppId, String ownershipState, String visibility) {
        Instant seenAt = Instant.parse("2026-06-21T12:00:00Z");
        return new ObservedService(
                id,
                "docker",
                id.replace("docker:", ""),
                catalogAppId,
                "http://localhost:8096",
                "LAN",
                catalogAppId,
                "user",
                ownershipState,
                "running",
                "foreign_autark_os".equals(ownershipState) ? "other-instance" : "",
                seenAt,
                seenAt,
                "{}");
    }

    private static final class RecordingMarketplaceInstallService extends MarketplaceInstallService {
        private InstallOptionsRequest lastOptions;

        private RecordingMarketplaceInstallService() {
            super(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
        }

        @Override
        public InstallModels.InstallResult install(com.autarkos.marketplace.model.ApplicationManifest manifest, InstallOptionsRequest options, java.util.function.Consumer<InstallModels.InstallStep> progressSink) {
            lastOptions = options;
            return new InstallModels.InstallResult(manifest.id(), manifest.name(), "installed", "Installed.", manifest.accessUrl(), null, List.of(), List.of(), null, null);
        }
    }
}
