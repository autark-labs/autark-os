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

import com.autarkos.apps.AppOwnershipState;
import com.autarkos.apps.ApplicationState;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceRepository;
import com.autarkos.host.ObservedServiceScanner;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppOwnershipMetadata;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.InstallCustomizationResolver;
import com.autarkos.marketplace.install.InstallResult;
import com.autarkos.marketplace.install.InstallStep;
import com.autarkos.marketplace.install.MarketplaceInstallService;
import com.autarkos.marketplace.install.PortAllocator;
import com.autarkos.marketplace.plan.InstallPlanService;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.testsupport.JpaTestRepositories;

class DiscoverServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void returnsMergedDiscoverCardsWithoutShowingForeignAppsAsInstalled() {
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
        repository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
                "vaultwarden",
                "appinst_vaultwarden",
                "vaultwarden",
                "current-instance",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "installed",
                "owned",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z")));

        List<DiscoverAppView> apps = service.apps();

        assertThat(apps).filteredOn(app -> app.id().equals("vaultwarden"))
                .singleElement()
                .satisfies(app -> {
                    assertThat(app.state()).isEqualTo(AppOwnershipState.INSTALLED_MANAGED);
                    assertThat(app.primaryAction().id()).isEqualTo("manage");
                    assertThat(app.statusTone()).isEqualTo("success");
                    assertThat(app.cardTone()).isEqualTo("success");
                    assertThat(app.ownedByCurrentInstance()).isTrue();
                    assertThat(app.installCopyWarningRequired()).isFalse();
                    assertThat(app.installedApp()).isNotNull();
                });
        assertThat(apps).filteredOn(app -> app.id().equals("jellyfin"))
                .singleElement()
                .satisfies(app -> {
                    assertThat(app.state()).isEqualTo(AppOwnershipState.MANAGED_ELSEWHERE);
                    assertThat(app.stateLabel()).isEqualTo("Managed elsewhere");
                    assertThat(app.primaryAction().id()).isEqualTo("review_existing");
                    assertThat(app.statusTone()).isEqualTo("danger");
                    assertThat(app.cardTone()).isEqualTo("danger");
                    assertThat(app.ownedByCurrentInstance()).isFalse();
                    assertThat(app.installCopyWarningRequired()).isTrue();
                    assertThat(app.availableActions()).extracting(com.autarkos.apps.AppOwnershipAction::id).contains("review_existing", "install_copy");
                    assertThat(app.installedApp()).isNull();
                    assertThat(app.observedService()).isNotNull();
                });
    }

    @Test
    void discoverNeverReturnsAvailableForMatchedObservedService() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("docker:vaultwarden", "vaultwarden", "external_docker", "observed"));
        DiscoverService service = discoverService(observedRepository);

        DiscoverAppView app = service.app("vaultwarden").orElseThrow();

        assertThat(app.state()).isEqualTo(AppOwnershipState.FOUND_ON_SERVER);
        assertThat(app.cardTone()).isEqualTo("observed");
        assertThat(app.installCopyWarningRequired()).isTrue();
    }

    @Test
    void buildsCommonAndAppSpecificSetupSchemaFromBackend() {
        DiscoverService service = discoverService(observedRepository());

        DiscoverSetupSchema schema = service.setupSchema("jellyfin");

        assertThat(schema.inputs()).extracting(DiscoverSetupInput::id)
                .contains("displayName", "accessMode", "storageMode", "backupPolicy", "localBrowserPort", "jellyfinMediaFolder", "jellyfinExistingMediaPath");
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
        Path media = Files.createDirectory(runtimeRoot.resolve("media"));

        DiscoverInstallPreview invalid = service.installPreview("jellyfin", new DiscoverSetupAnswersRequest(Map.of(
                "displayName", "Family Movies",
                "accessMode", "lan_only",
                "storageMode", "autark_os_default",
                "backupPolicy", "disabled",
                "localBrowserPort", "auto",
                "jellyfinMediaFolder", "existing_folder",
                "jellyfinExistingMediaPath", runtimeRoot.resolve("missing").toString())));

        assertThat(invalid.valid()).isFalse();
        assertThat(invalid.blockingIssues()).extracting(DiscoverInstallIssue::fieldId)
                .containsExactly("jellyfinExistingMediaPath");

        DiscoverInstallPreview valid = service.installPreview("jellyfin", new DiscoverSetupAnswersRequest(Map.of(
                "displayName", "Family Movies",
                "accessMode", "lan_only",
                "storageMode", "autark_os_default",
                "backupPolicy", "disabled",
                "localBrowserPort", 19096,
                "jellyfinMediaFolder", "existing_folder",
                "jellyfinExistingMediaPath", media.toString())));

        assertThat(valid.valid()).isTrue();
        assertThat(valid.sections()).filteredOn(section -> section.id().equals("connect"))
                .singleElement()
                .extracting(DiscoverInstallPreviewSection::items)
                .asList()
                .anySatisfy(item -> assertThat(((DiscoverInstallPreviewItem) item).label()).contains("home network"));
        assertThat(valid.sections()).filteredOn(section -> section.id().equals("protect"))
                .singleElement()
                .extracting(DiscoverInstallPreviewSection::items)
                .asList()
                .anySatisfy(item -> assertThat(((DiscoverInstallPreviewItem) item).tone()).isEqualTo("warning"));
        assertThat(valid.installOptions().ports().hostPort()).isEqualTo(19096);
        assertThat(valid.installOptions().backup().enabled()).isFalse();
        assertThat(valid.technicalDetails().technical().volumes())
                .anySatisfy(volume -> assertThat(volume).startsWith(media.toString() + ":/media"));
    }

    @Test
    void setupAnswersArePersistedWithInstallIntent() {
        DiscoverSetupRepository setupRepository = JpaTestRepositories.discoverSetupRepository(runtimeLayout());
        DiscoverSetupAnswers answers = new DiscoverSetupAnswers(Map.of(
                "displayName", "Family Passwords",
                "accessMode", "private_lan",
                "storageMode", "autark_os_default",
                "backupPolicy", "enabled_first_checkpoint",
                "localBrowserPort", "auto"));

        setupRepository.save("vaultwarden", "vaultwarden", answers);

        assertThat(setupRepository.recordByAppId("vaultwarden")).hasValueSatisfying(record -> {
            assertThat(record.displayName()).isEqualTo("Family Passwords");
            assertThat(record.accessMode()).isEqualTo("private_lan");
            assertThat(record.backupPolicy()).isEqualTo("enabled_first_checkpoint");
            assertThat(record.answers().values()).containsEntry("displayName", "Family Passwords");
        });
    }

    @Test
    void installPassesDuplicateAcknowledgementToMarketplaceInstall() {
        RecordingMarketplaceInstallService installService = new RecordingMarketplaceInstallService();
        AutarkOsJobService jobService = jobService();
        DiscoverService service = discoverService(observedRepository(), installService, jobService);

        service.install("vaultwarden", new DiscoverInstallRequest(Map.of(), false, true));
        jobService.runQueuedJobsNow();

        assertThat(installService.lastOptions).isNotNull();
        assertThat(installService.lastOptions.duplicateAcknowledgedRequested()).isTrue();
    }

    @Test
    void installPersistsSetupAnswersBeforeStartingInstallJob() {
        RuntimeLayout layout = runtimeLayout();
        DiscoverSetupRepository setupRepository = JpaTestRepositories.discoverSetupRepository(layout);
        DiscoverSetupService setupService = new DiscoverSetupService(setupRepository);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new PortAllocator());
        DiscoverService service = new DiscoverService(
                catalogService(),
                List::of,
                setupService,
                new DiscoverInstallPreviewService(new InstallPlanService(layout, customizationResolver), setupService),
                new RecordingMarketplaceInstallService(),
                jobService());

        service.install("vaultwarden", new DiscoverInstallRequest(Map.of(
                "displayName", "Family Passwords",
                "accessMode", "private_lan",
                "storageMode", "autark_os_default",
                "backupPolicy", "enabled_first_checkpoint",
                "localBrowserPort", "auto"), false, true));

        assertThat(setupRepository.recordByAppId("vaultwarden")).hasValueSatisfying(record -> {
            assertThat(record.displayName()).isEqualTo("Family Passwords");
            assertThat(record.accessMode()).isEqualTo("private_lan");
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
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z")));
        DiscoverService service = new DiscoverService(
                catalogService(),
                applicationStateService,
                setupService,
                new DiscoverInstallPreviewService(new InstallPlanService(layout, customizationResolver), setupService),
                new RecordingMarketplaceInstallService(),
                jobService());

        service.install("vaultwarden", new DiscoverInstallRequest(Map.of(), false, true));

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
                () -> appOwnershipService(installedAppRepository, observedRepository).apps(),
                setupService,
                new DiscoverInstallPreviewService(new InstallPlanService(layout, customizationResolver), setupService));
    }

    private DiscoverService discoverService(ObservedServiceRepository observedRepository, MarketplaceInstallService installService, AutarkOsJobService jobService) {
        RuntimeLayout layout = runtimeLayout();
        InstalledAppRepository installedAppRepository = repository();
        DiscoverSetupRepository setupRepository = JpaTestRepositories.discoverSetupRepository(layout);
        DiscoverSetupService setupService = new DiscoverSetupService(setupRepository);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new PortAllocator());
        return new DiscoverService(
                catalogService(),
                () -> appOwnershipService(installedAppRepository, observedRepository).apps(),
                setupService,
                new DiscoverInstallPreviewService(new InstallPlanService(layout, customizationResolver), setupService),
                installService,
                jobService);
    }

    private com.autarkos.apps.AppOwnershipService appOwnershipService(InstalledAppRepository installedAppRepository, ObservedServiceRepository observedRepository) {
        return new com.autarkos.apps.AppOwnershipService(
                catalogService(),
                installedAppRepository,
                new ObservedServiceService(observedRepository, new ObservedServiceScanner(List::of, () -> new com.autarkos.system.AutarkOsIdentity("current-instance", "autark-os", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1))),
                new com.autarkos.marketplace.install.DockerOwnershipService(
                        () -> new com.autarkos.system.AutarkOsIdentity("current-instance", "autark-os", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1),
                        () -> "0.2.0",
                        false),
                JpaTestRepositories.backupRepository(runtimeLayout()));
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
                "External",
                "LAN",
                catalogAppId,
                "user",
                ownershipState,
                visibility,
                "running",
                false,
                "foreign_autark_os".equals(ownershipState) ? "other-instance" : "",
                seenAt,
                seenAt,
                "pinned".equals(visibility) ? seenAt : null,
                null,
                "{}");
    }

    private static final class RecordingMarketplaceInstallService extends MarketplaceInstallService {
        private InstallOptionsRequest lastOptions;

        private RecordingMarketplaceInstallService() {
            super(null, null, null, null, null, null, null, null, null, null);
        }

        @Override
        public InstallResult install(com.autarkos.marketplace.model.ApplicationManifest manifest, InstallOptionsRequest options, java.util.function.Consumer<InstallStep> progressSink) {
            lastOptions = options;
            return new InstallResult(manifest.id(), manifest.name(), "installed", "Installed.", manifest.accessUrl(), null, List.of(), List.of(), null, null);
        }
    }
}
