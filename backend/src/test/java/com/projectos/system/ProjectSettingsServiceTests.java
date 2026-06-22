package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.activity.ActivityLogRepository;
import com.projectos.activity.ActivityLogService;
import com.projectos.marketplace.install.BackupPolicy;
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class ProjectSettingsServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void appliesBackupAndRepairDefaultsToInstalledAppsWithoutReplacingAppSpecificSettings() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedApps = new InstalledAppRepository(runtimeLayout);
        ProjectSettingsService service = new ProjectSettingsService(
                new ProjectSettingsRepository(runtimeLayout),
                new ActivityLogService(new ActivityLogRepository(runtimeLayout)),
                installedApps);
        Instant installedAt = Instant.parse("2026-06-21T12:00:00Z");
        Instant checkedAt = Instant.parse("2026-06-21T12:30:00Z");
        installedApps.save(new InstalledApp("vaultwarden", "Vaultwarden", "Ready", "/apps/vaultwarden", "project-os-vaultwarden", "http://localhost:8090", installedAt));
        installedApps.save(new InstalledApp("homepage", "Homepage", "Ready", "/apps/homepage", "project-os-homepage", "http://localhost:3000", installedAt));
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
                "project-os",
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
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
