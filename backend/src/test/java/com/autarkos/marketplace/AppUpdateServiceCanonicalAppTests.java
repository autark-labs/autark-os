package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppUpdateService;
import com.autarkos.marketplace.install.AppUpdateStatus;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.ProjectSettingsRepository;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.testsupport.JpaTestRepositories;

class AppUpdateServiceCanonicalAppTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void statusesOnlyIncludeCanonicalManagedApps() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository repository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        repository.save(installed(runtimeLayout, "homepage", "Homepage"));
        repository.save(installed(runtimeLayout, "vaultwarden", "Vaultwarden"));
        ActivityLogService activityLogService = new ActivityLogService(mock(ActivityLogRepository.class));
        AppUpdateService service = new AppUpdateService(
                repository,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                null,
                null,
                null,
                null,
                activityLogService,
                new ProjectSettingsService(JpaTestRepositories.projectSettingsRepository(runtimeLayout), activityLogService),
                () -> List.of(appInstance("homepage")));

        assertThat(service.statuses())
                .extracting(AppUpdateStatus::appId)
                .containsExactly("homepage");
    }

    private InstalledApp installed(RuntimeLayout runtimeLayout, String appId, String name) throws Exception {
        Path appRoot = runtimeLayout.appRoot(appId);
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services:\n  app:\n    image: example/" + appId + ":old\n");
        return new InstalledApp(appId, name, "Ready", appRoot.toString(), "autark-os-" + appId, "http://localhost:8090", Instant.parse("2026-06-20T12:00:00Z"));
    }

    private AppInstanceView appInstance(String appId) {
        return new AppInstanceView(
                "appinst_" + appId,
                appId,
                appId,
                "General",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                "local_ready",
                "backup_disabled",
                "http://localhost:8090",
                null,
                List.of(),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
