package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Map;
import java.util.zip.ZipFile;

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
import com.autarkos.marketplace.install.ManagedStorageContractService;
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
    void failedDiskMeasurementIsUnavailableRatherThanHealthyOrFull() throws Exception {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(tempDir.resolve("valid-runtime").toString());
        StorageService service = storageService(new RuntimeLayout(properties));
        Path blocker = tempDir.resolve("not-a-directory");
        Files.writeString(blocker, "blocks the runtime path");
        properties.setRuntimeRoot(blocker.resolve("runtime").toString());

        StorageModels.StorageReport report = service.report();

        assertThat(report.status()).isEqualTo("warning");
        assertThat(report.hostDisk().usedPercent()).isEqualTo(-1);
        assertThat(report.hostDisk().usableBytes()).isEqualTo(-1);
        assertThat(report.recommendations().getFirst().id()).isEqualTo("disk-unavailable");
        assertThat(report.recommendations()).noneMatch(item -> item.id().equals("disk-healthy"));
        assertThat(report.summary()).contains("could not measure").doesNotContain("0 B free");
        assertThat(report.installSafety().installAllowed()).isFalse();
        assertThat(report.installSafety().message()).contains("unavailable");
    }

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

    @Test
    void cleanupIsBlockedWhenDurableDataPlacementCannotBeProven() throws Exception {
        RuntimeLayout layout = runtimeLayout(tempDir.resolve("blocked-cleanup-runtime"));
        Path orphan = layout.appRoot("legacy-app");
        Files.createDirectories(orphan);
        Files.writeString(orphan.resolve("unknown.db"), "keep me");
        StorageService service = storageService(layout);

        assertThatThrownBy(() -> service.cleanupOrphan("legacy-app", archive -> {}))
                .hasMessageContaining("durable data placement cannot be proven");
        assertThat(orphan.resolve("unknown.db")).exists();
    }

    private StorageService storageService(RuntimeLayout layout) {
        return storageService(layout, JpaTestRepositories.installedAppRepository(layout), List.of());
    }

    private StorageService storageService(
            RuntimeLayout layout,
            InstalledAppRepository repository,
            List<InstalledApp> apps) {
        return storageService(layout, repository, apps, new RuntimeFileOperations(),
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()),
                new ManagedStorageContractService.CleanupAssessment(false, "Storage proof is unavailable.", Map.of()));
    }

    private StorageService storageService(RuntimeLayout layout, InstalledAppRepository repository, List<InstalledApp> apps,
            RuntimeFileOperations files, AutarkOsFileOpsService fileOps, ManagedStorageContractService.CleanupAssessment assessment) {
        ManagedAppAttestationService managedApps = mock(ManagedAppAttestationService.class);
        when(managedApps.managedApps()).thenReturn(apps);
        ManagedStorageContractService storageContracts = mock(ManagedStorageContractService.class);
        when(storageContracts.assessOrphan(org.mockito.ArgumentMatchers.any(Path.class)))
                .thenReturn(assessment);
        when(storageContracts.assessOrphans(org.mockito.ArgumentMatchers.anyList()))
                .thenAnswer(invocation -> {
                    java.util.Map<Path, ManagedStorageContractService.CleanupAssessment> assessments = new java.util.LinkedHashMap<>();
                    for (Path path : invocation.<List<Path>>getArgument(0)) {
                        assessments.put(path, new ManagedStorageContractService.CleanupAssessment(false, "Storage proof is unavailable.", java.util.Map.of()));
                    }
                    return assessments;
                });
        return new StorageService(
                layout,
                repository,
                new ActivityLogService(mock(ActivityLogRepository.class)),
                mock(StorageSampleRepository.class),
                managedApps,
                mock(BackupRepository.class),
                mock(MarketplaceCatalogService.class),
                files,
                new BackupDestinationService(
                        layout,
                        JpaTestRepositories.projectSettingsRepository(layout)),
                new RecoveryOperationCoordinator(),
                storageContracts,
                fileOps);
    }

    @Test
    void cleanupArchivesDeclaredDataBeforeDeletingAndPreservesOtherFolders() throws Exception {
        RuntimeLayout layout = runtimeLayout(tempDir.resolve("cleanup"));
        Path orphan = layout.appRoot("old-app");
        Files.createDirectories(orphan.resolve("data"));
        Files.writeString(orphan.resolve("data/database"), "important data");
        Files.writeString(orphan.resolve("compose.yml"), "not a complete installation backup");
        Path unrelated = Files.createDirectories(layout.appRoot("keep-app"));
        List<Path> archives = new ArrayList<>();
        Path archive = cleanupService(layout, new RuntimeFileOperations(),
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations())).cleanupOrphan("old-app", saved -> {
                    assertThat(orphan).exists();
                    assertThat(saved).exists();
                    archives.add(saved);
                });
        assertThat(archives).containsExactly(archive);
        assertThat(orphan).doesNotExist();
        assertThat(unrelated).exists();
        try (ZipFile zip = new ZipFile(archive.toFile())) {
            assertThat(zip.getEntry("data/database")).isNotNull();
            assertThat(new String(zip.getInputStream(zip.getEntry("data/database")).readAllBytes())).isEqualTo("important data");
            assertThat(zip.getEntry("compose.yml")).isNull();
        }
    }

    @Test
    void archiveFailureDoesNotDeleteAndRemovalFailureRetainsArchive() throws Exception {
        RuntimeLayout layout = runtimeLayout(tempDir.resolve("failure"));
        Path orphan = Files.createDirectories(layout.appRoot("old-app").resolve("data"));
        Files.writeString(orphan.resolve("database"), "keep me");
        AutarkOsFileOpsService failingArchive = new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()) {
            @Override public long createManagedArchive(String appId, Map<String, Path> paths, Path target, Path root) throws IOException {
                throw new IOException("archive failed");
            }
        };
        assertThatThrownBy(() -> cleanupService(layout, new RuntimeFileOperations(), failingArchive)
                .cleanupOrphan("old-app", archive -> { throw new AssertionError("Archive not completed"); }))
                .hasMessageContaining("folder was not removed");
        assertThat(orphan.resolve("database")).hasContent("keep me");

        RuntimeFileOperations failingRemoval = new RuntimeFileOperations() {
            @Override public void deleteRecursively(Path path) throws IOException { throw new IOException("removal failed"); }
        };
        List<Path> archives = new ArrayList<>();
        assertThatThrownBy(() -> cleanupService(layout, failingRemoval,
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations())).cleanupOrphan("old-app", archives::add))
                .hasMessageContaining("archive was saved");
        assertThat(archives).hasSize(1);
        assertThat(archives.getFirst()).exists();
        assertThat(orphan.resolve("database")).hasContent("keep me");
    }

    @Test
    void cleanupRejectsUnsafeNamesAndInstalledAppsBeforeArchiving() throws Exception {
        RuntimeLayout layout = runtimeLayout(tempDir.resolve("validation"));
        Files.createDirectories(layout.appRoot("old-app"));
        StorageService service = storageService(layout, JpaTestRepositories.installedAppRepository(layout), List.of(installed(layout, "old-app", "Old app")));
        for (String name : List.of("../old-app", "old-app")) {
            assertThatThrownBy(() -> service.cleanupOrphan(name, archive -> { throw new AssertionError("Must not archive"); }))
                    .isInstanceOf(com.autarkos.marketplace.install.InstallationException.class);
        }
        assertThat(layout.appRoot("old-app")).exists();
    }

    private StorageService cleanupService(RuntimeLayout layout, RuntimeFileOperations files, AutarkOsFileOpsService fileOps) {
        return storageService(layout, JpaTestRepositories.installedAppRepository(layout), List.of(), files, fileOps,
                new ManagedStorageContractService.CleanupAssessment(true, "", Map.of("data", layout.appRoot("old-app").resolve("data"))));
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
