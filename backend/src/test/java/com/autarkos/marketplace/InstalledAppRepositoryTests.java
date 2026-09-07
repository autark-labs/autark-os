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
    void accessObservationCannotOverwritePreferencesOrResurrectRemovedSettings() {
        InstalledAppRepository repository = JpaTestRepositories.installedAppRepository(runtimeLayout());
        repository.save(new InstalledApp("syncthing", "Syncthing", "Ready", "/apps/syncthing", "syncthing", "http://localhost:8384", Instant.now()));
        var preferences = InstallModels.InstallSettings.defaults("http://localhost:18384");
        repository.saveSettings("syncthing", preferences);
        repository.updateAccessCheckTimestamps("syncthing", "2026-09-07T12:00:10Z", 1);
        repository.updateAccessCheckTimestamps("syncthing", "2026-09-07T12:00:11Z", 0);
        repository.updateAccessCheckTimestamps("syncthing", "2026-09-07T12:00:09Z", 1);
        var actual = repository.settingsFor("syncthing").orElseThrow();
        assertThat(actual.accessUrl()).isEqualTo(preferences.accessUrl());
        assertThat(actual.backup()).isEqualTo(preferences.backup());
        assertThat(actual.autoRepairEnabled()).isEqualTo(preferences.autoRepairEnabled());
        assertThat(actual.lastAccessCheckAt()).isEqualTo(Instant.parse("2026-09-07T12:00:11Z"));
        assertThat(actual.lastSuccessfulAccessAt()).isEqualTo(Instant.parse("2026-09-07T12:00:10Z"));
        repository.updateAccessCheckTimestamps("not-installed", "2026-09-07T12:00:12Z", 1);
        assertThat(repository.settingsFor("not-installed")).isEmpty();
    }

    @Test
    void concurrentLifecycleAndObservationWritesCompleteWithoutDatabaseLockFailures() throws Exception {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.installedAppRepository(layout);
        var observed = JpaTestRepositories.observedServiceRepository(layout);
        var now = Instant.now();
        repository.save(new InstalledApp("syncthing", "Syncthing", "Ready", "/apps/syncthing", "syncthing", "http://localhost:8384", now));
        repository.saveSettings("syncthing", InstallModels.InstallSettings.defaults("http://localhost:8384"));
        var start = new java.util.concurrent.CountDownLatch(1);
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(4)) {
            var futures = java.util.stream.IntStream.range(0, 4).mapToObj(worker -> workers.submit(() -> {
                start.await();
                for (int iteration = 0; iteration < 30; iteration++) {
                    switch (worker) {
                        case 0 -> {
                            repository.updateStatus("syncthing", iteration % 2 == 0 ? "Paused" : "Ready");
                            repository.recordEvent("syncthing", "lifecycle", "Lifecycle result recorded.");
                        }
                        case 1 -> repository.updateAccessCheckTimestamps("syncthing", now.plusSeconds(iteration).toString(), 1);
                        case 2 -> repository.saveHealthSnapshot(new AppHealthSnapshot("syncthing", "Ready", "Ready", "Healthy", "running", "reachable", "not_configured", false, Instant.now()));
                        case 3 -> {
                            observed.upsert(new com.autarkos.host.ObservedService(
                                    "docker:syncthing", "docker", "syncthing", "Syncthing", "http://localhost:8384",
                                    "Productivity", "local", "syncthing", "exact", "owned_managed", "observed", "running",
                                    true, "test-instance", now, now.plusSeconds(iteration), null, null, "{}"));
                        }
                        default -> throw new AssertionError();
                    }
                }
                return true;
            })).toList();
            start.countDown();
            for (var future : futures) assertThat(future.get(20, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        }
        assertThat(repository.eventsFor("syncthing", 100)).hasSize(30);
        assertThat(repository.healthFor("syncthing")).isPresent();
        assertThat(observed.findServiceById("docker:syncthing")).isPresent();
    }

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
