package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.backups.BackupDestinationService;
import com.autarkos.backups.BackupRepository;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.fileops.LocalAutarkOsFileOperations;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;
import java.time.Instant;
import java.util.List;

class StorageServiceTests {

    @Test
    void backupUsageMeasuresOnlyBackupFilesAndReportsMissingMeasurement() throws Exception {
        RuntimeLayout layout = runtimeLayout(tempDir.resolve("measured-runtime"));
        Files.createDirectories(layout.runtimeRoot().resolve("backups"));
        Files.writeString(layout.runtimeRoot().resolve("backups/point.zip"), "12345");
        Files.writeString(layout.runtimeRoot().resolve("unrelated.data"), "x".repeat(1000));
        StorageService service = storageService(layout);
        assertThat(service.report().backupStorage().usedBytes()).isEqualTo(5);
        assertThat(service.report().backupStorage().totalBytes()).isGreaterThan(5);
        RuntimeFileOperations files = new RuntimeFileOperations();
        assertThat(files.measuredDirectorySize(layout.runtimeRoot().resolve("absent"))).isEqualTo(-1);
        Files.createDirectories(layout.runtimeRoot().resolve("empty"));
        assertThat(files.measuredDirectorySize(layout.runtimeRoot().resolve("empty"))).isZero();
    }

    @TempDir
    Path tempDir;

    @Test
    void reportOnlyIncludesCanonicalManagedApps() throws Exception {
        RuntimeLayout layout = runtimeLayout(tempDir.resolve("runtime"));
        Files.createDirectories(layout.appRoot("homepage"));
        Files.createDirectories(layout.appRoot("vaultwarden"));
        InstalledAppRepository repository = JpaTestRepositories.installedAppRepository(layout);
        repository.save(installed(layout, "homepage", "Homepage"));
        repository.save(installed(layout, "vaultwarden", "Vaultwarden"));
        StorageService service = storageService(layout, repository, List.of(installed(layout, "homepage", "Homepage")));

        StorageModels.StorageReport report = service.report();

        assertThat(report.apps()).extracting(StorageModels.AppStorageUsage::appId).containsExactly("homepage");
        assertThat(report.orphanedData()).extracting(StorageModels.OrphanedStorage::name).contains("vaultwarden");
    }

    private StorageService storageService(RuntimeLayout layout) {
        return storageService(layout, JpaTestRepositories.installedAppRepository(layout), List.of());
    }

    private StorageService storageService(
            RuntimeLayout layout,
            InstalledAppRepository repository,
            List<InstalledApp> apps) {
        AutarkOsFileOpsService fileOps = new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations());
        ManagedAppAttestationService managedApps = mock(ManagedAppAttestationService.class);
        when(managedApps.managedApps()).thenReturn(apps);
        return new StorageService(
                layout,
                repository,
                new ActivityLogService(mock(ActivityLogRepository.class)),
                mock(StorageSampleRepository.class),
                managedApps,
                mock(BackupRepository.class),
                mock(MarketplaceCatalogService.class),
                new RuntimeFileOperations(),
                new BackupDestinationService(
                        layout,
                        JpaTestRepositories.projectSettingsRepository(layout),
                        fileOps),
                new RecoveryOperationCoordinator());
    }

    private InstalledApp installed(RuntimeLayout layout, String appId, String name) {
        return new InstalledApp(appId, name, "Ready", layout.appRoot(appId).toString(), "autark-os-" + appId, "http://localhost:8090", Instant.parse("2026-06-20T12:00:00Z"));
    }

    private RuntimeLayout runtimeLayout(Path runtimeRoot) {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
