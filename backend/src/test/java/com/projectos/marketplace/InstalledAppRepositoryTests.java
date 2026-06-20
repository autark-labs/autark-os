package com.projectos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.install.AppHealthSnapshot;
import com.projectos.marketplace.install.BackupPolicy;
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class InstalledAppRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void savesAppsSettingsEventsAndHealthSnapshots() {
        InstalledAppRepository repository = new InstalledAppRepository(runtimeLayout());
        Instant installedAt = Instant.parse("2026-06-19T00:00:00Z");
        Instant checkedAt = Instant.parse("2026-06-19T01:00:00Z");

        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", "/apps/vaultwarden", "project-os-vaultwarden", "http://localhost:8090", installedAt));
        repository.saveSettings("vaultwarden", new InstallSettings(
                "http://localhost:8090",
                "https://vaultwarden.tail.ts.net",
                true,
                Map.of("data", "/apps/vaultwarden/data"),
                new BackupPolicy(true, "weekly", 3),
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

        assertThat(repository.findById("vaultwarden")).contains(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", "/apps/vaultwarden", "project-os-vaultwarden", "http://localhost:8090", installedAt));
        assertThat(repository.findAll()).extracting(InstalledApp::appId).containsExactly("vaultwarden");
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

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
