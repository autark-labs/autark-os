package com.projectos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.projectos.marketplace.api.MarketplaceController;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.marketplace.plan.InstallPlan;
import com.projectos.marketplace.plan.InstallPlanService;

@SpringBootTest
class MarketplaceCatalogServiceTests {

    @Autowired
    MarketplaceCatalogService catalogService;

    @Autowired
    InstallPlanService installPlanService;

    @Autowired
    MarketplaceController marketplaceController;

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
    void exposesCatalogAndPlanThroughMarketplaceController() {
        assertThat(marketplaceController.apps()).hasSize(26);
        assertThat(marketplaceController.plan("vaultwarden", null).getBody())
                .extracting(InstallPlan::appId)
                .isEqualTo("vaultwarden");
    }

    @Test
    void generatesInstallPlanWithoutExecutingRuntimeActions() {
        ApplicationManifest vaultwarden = catalogService.findById("vaultwarden").orElseThrow();

        InstallPlan plan = installPlanService.generatePlan(vaultwarden);

        assertThat(plan.appId()).isEqualTo("vaultwarden");
        assertThat(plan.friendly().willCreate()).contains("A protected runtime folder for Vaultwarden");
        assertThat(plan.technical().runtimeRoot()).endsWith("runtime/project-os/apps/vaultwarden");
        assertThat(plan.technical().labels()).contains("project-os.managed=true", "project-os.app-id=vaultwarden");
    }

    @Test
    void generatesMultiContainerPlanForPaperless() {
        ApplicationManifest paperless = catalogService.findById("paperless-ngx").orElseThrow();

        InstallPlan plan = installPlanService.generatePlan(paperless);

        assertThat(paperless.runtime().multiService()).isTrue();
        assertThat(plan.technical().containers())
                .extracting(container -> container.name())
                .containsExactlyInAnyOrder(
                        "project-os-paperless-ngx-web",
                        "project-os-paperless-ngx-broker",
                        "project-os-paperless-ngx-db");
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
