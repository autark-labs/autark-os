package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.autarkos.discover.DiscoverController;
import com.autarkos.discover.DiscoverInstallModels;
import com.autarkos.discover.DiscoverSetupModels;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstallModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.plan.InstallPlan;
import com.autarkos.marketplace.plan.InstallPlanService;

@SpringBootTest
class MarketplaceCatalogServiceTests {

    @Autowired
    MarketplaceCatalogService catalogService;

    @Autowired
    InstallPlanService installPlanService;

    @Autowired
    DiscoverController discoverController;

    @Test
    void loadsCatalogAppsFromManifests() {
        assertThat(catalogService.findAll())
                .extracting(ApplicationManifest::id)
                .containsExactlyInAnyOrder(
                        "actual-budget",
                        "adguard-home",
                        "bazarr",
                        "freshrss",
                        "gitea",
                        "grafana",
                        "home-assistant",
                        "homepage",
                        "immich",
                        "jellyfin",
                        "memos",
                        "netdata",
                        "nextcloud",
                        "nginx-proxy-manager",
                        "obsidian-livesync",
                        "paperless-ngx",
                        "pi-hole",
                        "prometheus",
                        "prowlarr",
                        "qbittorrent",
                        "radarr",
                        "sonarr",
                        "stirling-pdf",
                        "syncthing",
                        "uptime-kuma",
                        "vaultwarden");
    }

    @Test
    void exposesCatalogAndInstallPreviewThroughDiscoverController() {
        assertThat(discoverController.apps()).hasSize(26);
        DiscoverInstallModels.DiscoverInstallPreview preview = discoverController.installPreview("vaultwarden", new DiscoverSetupModels.DiscoverSetupAnswersRequest(java.util.Map.of()));

        assertThat(preview.technicalDetails())
                .extracting(InstallPlan::appId)
                .isEqualTo("vaultwarden");
    }

    @Test
    void generatesInstallPlanWithoutExecutingRuntimeActions() {
        ApplicationManifest vaultwarden = catalogService.findById("vaultwarden").orElseThrow();

        InstallPlan plan = installPlanService.generatePlan(vaultwarden);

        assertThat(plan.appId()).isEqualTo("vaultwarden");
        assertThat(plan.friendly().willCreate()).contains("A protected runtime folder for Vaultwarden");
        assertThat(plan.technical().runtimeRoot()).endsWith("runtime/autark-os/apps/vaultwarden");
        assertThat(plan.technical().labels()).contains("autark-os.managed=true", "autark-os.app-id=vaultwarden");
    }

    @Test
    void generatesMultiContainerPlanForPaperless() {
        ApplicationManifest paperless = catalogService.findById("paperless-ngx").orElseThrow();

        InstallPlan plan = installPlanService.generatePlan(paperless);

        assertThat(paperless.runtime().multiService()).isTrue();
        assertThat(plan.technical().containers())
                .extracting(container -> container.name())
                .containsExactlyInAnyOrder(
                        "autark-os-paperless-ngx-web",
                        "autark-os-paperless-ngx-broker",
                        "autark-os-paperless-ngx-db");
        assertThat(plan.technical().volumes())
                .anyMatch(volume -> volume.contains("/postgres:/var/lib/postgresql/data"))
                .anyMatch(volume -> volume.contains("/consume:/usr/src/paperless/consume"));
        assertThat(plan.technical().backupPaths()).contains("data", "media", "export", "consume", "postgres");
    }

    @Test
    void everyCatalogManifestDeclaresAccessExpectations() {
        assertThat(catalogService.findAll())
                .allSatisfy(manifest -> {
                    assertThat(manifest.access().kind()).isIn("web", "api", "background", "multi-port");
                    assertThat(manifest.access().defaultMode()).isIn("local", "private", "local-and-private", "none");
                    assertThat(manifest.access().notes()).isNotEmpty();
                });
    }

    @Test
    void everyCatalogManifestGeneratesAnInstallPlan() {
        assertThat(catalogService.findAll())
                .allSatisfy(manifest -> {
                    InstallPlan plan = installPlanService.generatePlan(manifest);

                    assertThat(plan.appId()).isEqualTo(manifest.id());
                    assertThat(plan.technical().containers()).isNotEmpty();
                    assertThat(plan.technical().volumes()).isNotEmpty();
                    if (!"background".equals(manifest.access().kind())) {
                        assertThat(plan.customization().accessUrl()).isNotBlank();
                    }
                });
    }
}
