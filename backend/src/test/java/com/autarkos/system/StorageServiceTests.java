package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import java.time.Instant;
import java.util.List;

class StorageServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void reportOnlyIncludesCanonicalManagedApps() throws Exception {
        RuntimeLayout layout = runtimeLayout(tempDir.resolve("runtime"));
        Files.createDirectories(layout.appRoot("homepage"));
        Files.createDirectories(layout.appRoot("vaultwarden"));
        InstalledAppRepository repository = new InstalledAppRepository(layout);
        repository.save(installed(layout, "homepage", "Homepage"));
        repository.save(installed(layout, "vaultwarden", "Vaultwarden"));
        StorageService service = new StorageService(
                layout,
                repository,
                new ActivityLogService(mock(ActivityLogRepository.class)),
                mock(StorageSampleRepository.class),
                () -> List.of(appInstance("homepage")),
                new RuntimeFileOperations());

        StorageReport report = service.report();

        assertThat(report.apps()).extracting(AppStorageUsage::appId).containsExactly("homepage");
        assertThat(report.orphanedData()).extracting(OrphanedStorage::name).contains("vaultwarden");
    }

    private StorageService storageService(RuntimeLayout layout) {
        return new StorageService(
                layout,
                new InstalledAppRepository(layout),
                new ActivityLogService(mock(ActivityLogRepository.class)),
                mock(StorageSampleRepository.class),
                new RuntimeFileOperations());
    }

    private InstalledApp installed(RuntimeLayout layout, String appId, String name) {
        return new InstalledApp(appId, name, "Ready", layout.appRoot(appId).toString(), "autark-os-" + appId, "http://localhost:8090", Instant.parse("2026-06-20T12:00:00Z"));
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

    private RuntimeLayout runtimeLayout(Path runtimeRoot) {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
