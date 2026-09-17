package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.testsupport.ManagedAppTestContract;

class ProjectSettingsServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void appliesBackupAndRepairDefaultsToInstalledAppsWithoutReplacingAppSpecificSettings() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedApps = JpaTestRepositories.installedAppRepository(runtimeLayout);
        Instant installedAt = Instant.parse("2026-06-21T12:00:00Z");
        Instant checkedAt = Instant.parse("2026-06-21T12:30:00Z");
        AutarkOsIdentity identity = new AutarkOsIdentity("current-instance", "test", runtimeRoot.toString(),
                "runtime-hash", installedAt, 1);
        installedApps.save(new InstalledApp("vaultwarden", "Vaultwarden", "Ready",
                runtimeLayout.appRoot("vaultwarden").toString(), "autarkos_test_vaultwarden", "http://localhost:8090", installedAt));
        installedApps.save(new InstalledApp("homepage", "Homepage", "Ready",
                runtimeLayout.appRoot("homepage").toString(), "autarkos_test_homepage", "http://localhost:3000", installedAt));
        saveOwnership(installedApps, runtimeLayout, identity, "vaultwarden", installedAt);
        saveOwnership(installedApps, runtimeLayout, identity, "homepage", installedAt);
        ManagedAppTestContract.writeAll(installedApps, runtimeLayout, identity);
        ProjectSettingsService service = new ProjectSettingsService(
                JpaTestRepositories.projectSettingsRepository(runtimeLayout),
                new ActivityLogService(mock(ActivityLogRepository.class)),
                installedApps,
                ManagedAppTestContract.service(installedApps, runtimeLayout, identity));
        installedApps.saveSettings("vaultwarden", new InstallModels.InstallSettings(
                "http://localhost:8090",
                "https://vaultwarden.tailnet.ts.net",
                true,
                Map.of("data", "/apps/vaultwarden/data"),
                new InstallModels.BackupPolicy(true, "weekly", 3),
                "local-and-private",
                "required",
                8090,
                "http",
                checkedAt,
                checkedAt,
                checkedAt,
                "completed",
                true));

        ProjectSettingsSaveResult saveResult = service.save(new ProjectSettings(
                "autark-os",
                "America/Chicago",
                "en-US",
                "fahrenheit",
                "MMM d, yyyy",
                "12-hour",
                true,
                false,
                "manifest-default",
                false,
                false,
                "monthly",
                120,
                "02:00",
                false,
                Instant.parse("2026-06-21T13:00:00Z")));
        ProjectSettingsAppDefaultsResult result = saveResult.appDefaults();

        assertThat(result.ok()).isTrue();
        assertThat(result.updatedApps()).isEqualTo(2);
        assertThat(saveResult.settings().automaticBackupsEnabled()).isFalse();
        assertThat(installedApps.settingsFor("vaultwarden")).hasValueSatisfying(settings -> {
            assertThat(settings.accessUrl()).isEqualTo("http://localhost:8090");
            assertThat(settings.privateAccessUrl()).isEqualTo("https://vaultwarden.tailnet.ts.net");
            assertThat(settings.tailscaleEnabled()).isTrue();
            assertThat(settings.storageSubfolders()).containsEntry("data", "/apps/vaultwarden/data");
            assertThat(settings.desiredAccessMode()).isEqualTo("local-and-private");
            assertThat(settings.privateAccessRequirement()).isEqualTo("required");
            assertThat(settings.expectedLocalPort()).isEqualTo(8090);
            assertThat(settings.lastRepairStatus()).isEqualTo("completed");
            assertThat(settings.backup()).isEqualTo(new InstallModels.BackupPolicy(false, "daily", 7));
            assertThat(settings.autoRepairEnabled()).isFalse();
        });
        assertThat(installedApps.settingsFor("homepage")).hasValueSatisfying(settings -> {
            assertThat(settings.accessUrl()).isEqualTo("http://localhost:3000");
            assertThat(settings.backup()).isEqualTo(new InstallModels.BackupPolicy(false, "daily", 7));
            assertThat(settings.autoRepairEnabled()).isFalse();
        });
    }

    private void saveOwnership(InstalledAppRepository repository, RuntimeLayout layout, AutarkOsIdentity identity,
            String appId, Instant installedAt) {
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                appId, "appinst_" + appId, appId, identity.instanceId(), layout.appRoot(appId).toString(),
                "ready", "owned", installedAt, installedAt));
    }

    @Test
    void rejectsAnInvalidTimeZoneBeforeItCanBreakBackupScheduling() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedApps = JpaTestRepositories.installedAppRepository(runtimeLayout);
        AutarkOsIdentity identity = new AutarkOsIdentity("current-instance", "test", runtimeRoot.toString(),
                "runtime-hash", Instant.now(), 1);
        ProjectSettingsService service = new ProjectSettingsService(
                JpaTestRepositories.projectSettingsRepository(runtimeLayout),
                new ActivityLogService(mock(ActivityLogRepository.class)),
                installedApps,
                ManagedAppTestContract.service(installedApps, runtimeLayout, identity));
        ProjectSettings defaults = ProjectSettings.defaults("autark-os");

        ProjectSettings saved = service.update(new ProjectSettings(
                defaults.deviceName(),
                "not-a-time-zone",
                defaults.language(),
                defaults.temperatureUnit(),
                defaults.dateFormat(),
                defaults.timeFormat(),
                defaults.startOnBoot(),
                defaults.telemetryEnabled(),
                defaults.defaultInstallAccess(),
                defaults.automaticRepairEnabled(),
                defaults.automaticBackupsEnabled(),
                defaults.backupFrequency(),
                defaults.backupRetentionDays(),
                defaults.backupTime(),
                defaults.showAdvancedMetrics(),
                Instant.now()));

        assertThat(saved.timeZone()).isEqualTo("America/Chicago");
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
