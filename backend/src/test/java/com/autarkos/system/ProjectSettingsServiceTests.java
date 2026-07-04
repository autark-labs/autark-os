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
import com.autarkos.marketplace.install.BackupPolicy;
import com.autarkos.marketplace.install.InstallSettings;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class ProjectSettingsServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void appliesBackupAndRepairDefaultsToInstalledAppsWithoutReplacingAppSpecificSettings() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedApps = new InstalledAppRepository(runtimeLayout);
        ProjectSettingsService service = new ProjectSettingsService(
                JpaTestRepositories.projectSettingsRepository(runtimeLayout),
                new ActivityLogService(mock(ActivityLogRepository.class)),
                installedApps);
        Instant installedAt = Instant.parse("2026-06-21T12:00:00Z");
        Instant checkedAt = Instant.parse("2026-06-21T12:30:00Z");
        installedApps.save(new InstalledApp("vaultwarden", "Vaultwarden", "Ready", "/apps/vaultwarden", "autark-os-vaultwarden", "http://localhost:8090", installedAt));
        installedApps.save(new InstalledApp("homepage", "Homepage", "Ready", "/apps/homepage", "autark-os-homepage", "http://localhost:3000", installedAt));
        installedApps.saveSettings("vaultwarden", new InstallSettings(
                "http://localhost:8090",
                "https://vaultwarden.tailnet.ts.net",
                true,
                Map.of("data", "/apps/vaultwarden/data"),
                new BackupPolicy(true, "weekly", 3),
                "local-and-private",
                "required",
                8090,
                "http",
                checkedAt,
                checkedAt,
                checkedAt,
                "completed",
                true));

        ProjectSettingsAppDefaultsResult result = service.applyAppDefaults(new ProjectSettings(
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
                "stable",
                false,
                Instant.parse("2026-06-21T13:00:00Z")));

        assertThat(result.ok()).isTrue();
        assertThat(result.updatedApps()).isEqualTo(2);
        assertThat(installedApps.settingsFor("vaultwarden")).hasValueSatisfying(settings -> {
            assertThat(settings.accessUrl()).isEqualTo("http://localhost:8090");
            assertThat(settings.privateAccessUrl()).isEqualTo("https://vaultwarden.tailnet.ts.net");
            assertThat(settings.tailscaleEnabled()).isTrue();
            assertThat(settings.storageSubfolders()).containsEntry("data", "/apps/vaultwarden/data");
            assertThat(settings.desiredAccessMode()).isEqualTo("local-and-private");
            assertThat(settings.privateAccessRequirement()).isEqualTo("required");
            assertThat(settings.expectedLocalPort()).isEqualTo(8090);
            assertThat(settings.lastRepairStatus()).isEqualTo("completed");
            assertThat(settings.backup()).isEqualTo(new BackupPolicy(false, "daily", 7));
            assertThat(settings.autoRepairEnabled()).isFalse();
        });
        assertThat(installedApps.settingsFor("homepage")).hasValueSatisfying(settings -> {
            assertThat(settings.accessUrl()).isEqualTo("http://localhost:3000");
            assertThat(settings.backup()).isEqualTo(new BackupPolicy(false, "daily", 7));
            assertThat(settings.autoRepairEnabled()).isFalse();
        });
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
