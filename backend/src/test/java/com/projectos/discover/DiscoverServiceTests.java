package com.projectos.discover;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.host.HostInventoryProvider;
import com.projectos.host.HostInventoryResource;
import com.projectos.marketplace.catalog.ManifestValidator;
import com.projectos.marketplace.catalog.ManifestYamlReader;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.install.InstallCustomizationResolver;
import com.projectos.marketplace.install.PortAllocator;
import com.projectos.marketplace.plan.InstallPlanService;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class DiscoverServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void returnsMergedDiscoverCardsWithoutShowingForeignAppsAsInstalled() {
        DiscoverService service = discoverService(List.of(foreignJellyfin()));
        repository().save(new InstalledApp(
                "vaultwarden",
                "Family Passwords",
                "Ready",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "project-os-vaultwarden",
                "http://localhost:8090",
                Instant.parse("2026-06-21T12:00:00Z")));

        List<DiscoverAppView> apps = service.apps();

        assertThat(apps).filteredOn(app -> app.id().equals("vaultwarden"))
                .singleElement()
                .satisfies(app -> {
                    assertThat(app.state()).isEqualTo("installed");
                    assertThat(app.primaryAction()).isEqualTo("manage");
                    assertThat(app.installedApp()).isNotNull();
                });
        assertThat(apps).filteredOn(app -> app.id().equals("jellyfin"))
                .singleElement()
                .satisfies(app -> {
                    assertThat(app.state()).isEqualTo("managed_elsewhere");
                    assertThat(app.stateLabel()).isEqualTo("Managed elsewhere");
                    assertThat(app.primaryAction()).isEqualTo("resolve");
                    assertThat(app.installedApp()).isNull();
                    assertThat(app.foundResource()).isNotNull();
                });
    }

    @Test
    void buildsCommonAndAppSpecificSetupSchemaFromBackend() {
        DiscoverService service = discoverService(List.of());

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
        DiscoverService service = discoverService(List.of());
        Path media = Files.createDirectory(runtimeRoot.resolve("media"));

        DiscoverInstallPreview invalid = service.installPreview("jellyfin", new DiscoverSetupAnswersRequest(Map.of(
                "displayName", "Family Movies",
                "accessMode", "lan_only",
                "storageMode", "project_os_default",
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
                "storageMode", "project_os_default",
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
        DiscoverSetupRepository setupRepository = new DiscoverSetupRepository(runtimeLayout());
        DiscoverSetupAnswers answers = new DiscoverSetupAnswers(Map.of(
                "displayName", "Family Passwords",
                "accessMode", "private_lan",
                "storageMode", "project_os_default",
                "backupPolicy", "enabled_first_checkpoint",
                "localBrowserPort", "auto"));

        setupRepository.save("vaultwarden", "vaultwarden", answers);

        assertThat(setupRepository.findByAppId("vaultwarden")).hasValueSatisfying(record -> {
            assertThat(record.displayName()).isEqualTo("Family Passwords");
            assertThat(record.accessMode()).isEqualTo("private_lan");
            assertThat(record.backupPolicy()).isEqualTo("enabled_first_checkpoint");
            assertThat(record.answers().values()).containsEntry("displayName", "Family Passwords");
        });
    }

    private DiscoverService discoverService(List<HostInventoryResource> inventory) {
        RuntimeLayout layout = runtimeLayout();
        InstalledAppRepository installedAppRepository = repository();
        DiscoverSetupRepository setupRepository = new DiscoverSetupRepository(layout);
        DiscoverSetupService setupService = new DiscoverSetupService(setupRepository);
        InstallCustomizationResolver customizationResolver = new InstallCustomizationResolver(new PortAllocator());
        return new DiscoverService(
                catalogService(),
                installedAppRepository,
                includeIgnored -> inventory,
                setupService,
                new DiscoverInstallPreviewService(new InstallPlanService(layout, customizationResolver), setupService));
    }

    private MarketplaceCatalogService catalogService() {
        return new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
    }

    private InstalledAppRepository repository() {
        return new InstalledAppRepository(runtimeLayout());
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private HostInventoryResource foreignJellyfin() {
        return new HostInventoryResource(
                "docker:projectos_other_jellyfin",
                "jellyfin",
                "jellyfin",
                "foreign_project_os",
                "observed",
                "other-instance",
                "current-instance",
                "running",
                List.of("http://localhost:8096"),
                "docker",
                List.of("view_details", "open", "cleanup", "ignore"),
                false,
                "high",
                "Found on this server, but managed by another Project OS installation.",
                Map.of());
    }
}
