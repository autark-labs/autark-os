package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.install.AppHealthSnapshot;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class InstalledAppRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void savesAppsSettingsEventsAndHealthSnapshots() {
        InstalledAppRepository repository = JpaTestRepositories.installedAppRepository(runtimeLayout());
        Instant installedAt = Instant.parse("2026-06-19T00:00:00Z");
        Instant checkedAt = Instant.parse("2026-06-19T01:00:00Z");

        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", "/apps/vaultwarden", "autark-os-vaultwarden", "http://localhost:8090", installedAt));
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                "https://vaultwarden.tail.ts.net",
                true,
                Map.of("data", "/apps/vaultwarden/data"),
                new InstallModels.BackupPolicy(true, "weekly", 3),
                "private",
                "recommended",
                8090,
                "http",
                checkedAt,
                checkedAt,
                checkedAt,
                "completed",
                false));
        repository.recordEvent("vaultwarden", "installed", "Vaultwarden installed.");
        repository.saveHealthSnapshot(new AppHealthSnapshot("vaultwarden", "Ready", "Ready", "Healthy", "Running", "reachable", "reachable", false, checkedAt));

        assertThat(repository.findAppById("vaultwarden")).contains(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", "/apps/vaultwarden", "autark-os-vaultwarden", "http://localhost:8090", installedAt));
        assertThat(repository.findAllApps()).extracting(InstalledApp::appId).containsExactly("vaultwarden");
        assertThat(repository.settingsFor("vaultwarden"))
                .hasValueSatisfying(settings -> {
                    assertThat(settings.tailscaleEnabled()).isTrue();
                    assertThat(settings.storageSubfolders()).containsEntry("data", "/apps/vaultwarden/data");
                    assertThat(settings.backup().frequency()).isEqualTo("weekly");
                    assertThat(settings.autoRepairEnabled()).isFalse();
                });
        assertThat(repository.eventsFor("vaultwarden", 5)).singleElement().satisfies(event -> assertThat(event.type()).isEqualTo("installed"));
        assertThat(repository.healthFor("vaultwarden")).hasValueSatisfying(snapshot -> assertThat(snapshot.privateAccessStatus()).isEqualTo("reachable"));
        assertThat(repository.healthSnapshots()).containsOnlyKeys("vaultwarden");
    }

    @Test
    void savesAndReadsOwnershipMetadataWithoutChangingInstalledAppApi() {
        InstalledAppRepository repository = JpaTestRepositories.installedAppRepository(runtimeLayout());
        Instant installedAt = Instant.parse("2026-06-19T00:00:00Z");
        Instant updatedAt = Instant.parse("2026-06-19T01:00:00Z");
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", "/apps/vaultwarden", "autarkos_homelab-box_vaultwarden", "http://localhost:8090", installedAt));

        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "vaultwarden",
                "appinst_vaultwarden",
                "vaultwarden",
                "pos_abcdef1234567890",
                "sha256:runtimehash",
                "ready",
                "owned",
                installedAt,
                updatedAt));

        assertThat(repository.ownershipFor("vaultwarden")).hasValueSatisfying(metadata -> {
            assertThat(metadata.appInstanceId()).isEqualTo("appinst_vaultwarden");
            assertThat(metadata.catalogAppId()).isEqualTo("vaultwarden");
            assertThat(metadata.autarkOsInstanceId()).isEqualTo("pos_abcdef1234567890");
            assertThat(metadata.runtimePathOrHash()).isEqualTo("sha256:runtimehash");
            assertThat(metadata.installState()).isEqualTo("ready");
            assertThat(metadata.ownershipStatus()).isEqualTo("owned");
            assertThat(metadata.createdAt()).isEqualTo(installedAt);
            assertThat(metadata.updatedAt()).isEqualTo(updatedAt);
        });
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
