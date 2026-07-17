package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.fileops.LocalAutarkOsFileOperations;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.DockerComposeExecutor;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.PostInstallGuideBuilder;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.system.ProjectSettingsRepository;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.RuntimeFileOperations;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.testsupport.RestorePointTestRecords;

class BackupServiceCanonicalAppTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void reportOnlyIncludesCanonicalManagedApps() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        InstalledApp staleVaultwarden = installed("vaultwarden", "Vaultwarden", runtimeLayout);
        installedRepository.save(homepage);
        installedRepository.save(staleVaultwarden);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        installedRepository.saveSettings("vaultwarden", new InstallModels.InstallSettings(staleVaultwarden.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));

        BackupService service = new BackupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                new ActivityLogService(mock(ActivityLogRepository.class)),
                JpaTestRepositories.projectSettingsRepository(runtimeLayout),
                new ProjectSettingsService(JpaTestRepositories.projectSettingsRepository(runtimeLayout), new ActivityLogService(mock(ActivityLogRepository.class))),
                appLifecycleService(runtimeLayout, installedRepository, catalogService, backupRepository),
                catalogService,
                () -> List.of(appInstance("homepage", "Homepage")),
                new RuntimeFileOperations());

        BackupModels.BackupReport report = service.report();

        assertThat(report.totalApps()).isEqualTo(1);
        assertThat(report.apps()).extracting(BackupModels.AppBackupStatus::appId).containsExactly("homepage");
    }

    @Test
    void backupEnabledWithoutRestorePointIsNotProtected() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));

        BackupModels.BackupReport report = backupService(runtimeLayout, installedRepository, backupRepository, catalogService).report();

        assertThat(report.protectedApps()).isZero();
        assertThat(report.status()).isEqualTo("attention");
        assertThat(report.summary()).isEqualTo("0 of 1 apps are protected by a verified restore point.");
        assertThat(report.apps()).singleElement().satisfies(app -> {
            assertThat(app.status()).isEqualTo("not_backed_up");
            assertThat(app.protectedByBackups()).isFalse();
            assertThat(app.message()).isEqualTo("No restore point yet.");
        });
    }

    @Test
    void missingComposeDisablesNormalAndFullBackupsWithRecoveryGuidance() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        Files.delete(runtimeLayout.appRoot("homepage").resolve("compose.yaml"));
        BackupService service = backupService(runtimeLayout, installedRepository, backupRepository, catalogService);

        BackupModels.BackupReport report = service.report();
        BackupModels.BackupRunResult appBackup = service.run("homepage");
        BackupModels.BackupRunResult fullBackup = service.runFullBackup("manual");

        assertThat(report.apps()).singleElement().satisfies(app -> {
            assertThat(app.status()).isEqualTo("recovery_limited");
            assertThat(app.backupAvailable()).isFalse();
            assertThat(app.backupUnavailableReason()).contains("original Compose file is missing").contains("archive-first cleanup");
        });
        assertThat(appBackup.status()).isEqualTo("failed");
        assertThat(appBackup.message()).contains("cannot use normal backups");
        assertThat(fullBackup.status()).isEqualTo("failed");
        assertThat(fullBackup.message()).contains("Full backup is unavailable").contains("Homepage");
    }

    @Test
    void legacyRestorePointIsNotPresentedAsProtected() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        RestorePointTestRecords.record(backupRepository, "homepage", "Homepage", "app", "manual", "homepage", "/backups/homepage.tar", "completed", 1024, "Backup completed.");

        BackupModels.BackupReport report = backupService(runtimeLayout, installedRepository, backupRepository, catalogService).report();

        assertThat(report.protectedApps()).isZero();
        assertThat(report.status()).isEqualTo("attention");
        assertThat(report.summary()).isEqualTo("0 of 1 apps are protected by a verified restore point.");
        assertThat(report.apps()).singleElement().satisfies(app -> {
            assertThat(app.status()).isEqualTo("not_backed_up");
            assertThat(app.protectedByBackups()).isFalse();
            assertThat(app.message()).contains("legacy restore point");
        });
    }

    @Test
    void restoreUsesAutarkOsFileOpsServiceForAppDataReplacement() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        RecordingFileOpsService fileOpsService = new RecordingFileOpsService(runtimeLayout);
        BackupService service = backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService);
        RestorePoint point = service.run("homepage").restorePoint();

        RestoreModels.RestoreResult result = service.restore(point.id(), "homepage");

        assertThat(result.status()).as(String.join("\n", result.logs())).isEqualTo("completed");
        assertThat(fileOpsService.restoreCalls).containsExactly("homepage|app|" + Path.of(point.path()).toAbsolutePath().normalize());
    }

    @Test
    void restoreRollsBackToVerifiedSafetyCheckpointWhenAppCannotRestart() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        RecordingFileOpsService fileOpsService = new RecordingFileOpsService(runtimeLayout);
        RestorePoint point = backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService).run("homepage").restorePoint();
        BackupService service = backupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                catalogService,
                fileOpsService,
                new FailingStartDockerComposeExecutor());

        assertThatThrownBy(() -> service.restore(point.id(), "homepage"))
                .hasMessageContaining("could not restore the safety checkpoint");
        assertThat(fileOpsService.restoreCalls).hasSize(2);
        assertThat(fileOpsService.restoreCalls.getFirst()).isEqualTo("homepage|app|" + Path.of(point.path()).toAbsolutePath().normalize());
        assertThat(fileOpsService.restoreCalls.get(1)).contains("homepage|app|").contains("pre-restore");
    }

    @Test
    void tamperedArchiveFailsVerificationAndBlocksRestoreBeforeLiveDataChanges() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        RecordingFileOpsService fileOpsService = new RecordingFileOpsService(runtimeLayout);
        BackupService service = backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService);

        RestorePoint point = service.run("homepage").restorePoint();
        assertThat(Files.isRegularFile(Path.of(point.path() + ".manifest.json"))).isTrue();
        assertThat(Files.readString(Path.of(point.path() + ".manifest.json"))).contains("appImageIdentity").contains("homepage").contains("archiveFormat");
        Files.writeString(Path.of(point.path()), "tampered", java.nio.file.StandardOpenOption.APPEND);

        BackupModels.BackupVerificationResult verification = service.verify(point.id());
        RestoreModels.RestorePlan plan = service.restorePlan(point.id(), "homepage");

        assertThat(verification.status()).isEqualTo("failed");
        assertThat(verification.message()).contains("checksum").contains("immutable");
        assertThat(plan.executable()).isFalse();
        assertThat(fileOpsService.restoreCalls).isEmpty();
    }

    @Test
    void modifiedBackupManifestFailsVerificationAndBlocksRestore() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        BackupService service = backupService(runtimeLayout, installedRepository, backupRepository, catalogService);

        RestorePoint point = service.run("homepage").restorePoint();
        Files.writeString(Path.of(point.path() + ".manifest.json"), "{}", java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);

        BackupModels.BackupVerificationResult verification = service.verify(point.id());
        RestoreModels.RestorePlan plan = service.restorePlan(point.id(), "homepage");

        assertThat(verification.status()).isEqualTo("failed");
        assertThat(verification.message()).contains("manifest");
        assertThat(plan.executable()).isFalse();
    }

    @Test
    void failedStopPreventsColdBackupBeforeAnyArchiveIsCreated() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        BackupService service = backupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                catalogService,
                new AutarkOsFileOpsService(runtimeLayout, new LocalAutarkOsFileOperations()),
                new FailingStopDockerComposeExecutor());

        BackupModels.BackupRunResult result = service.run("homepage");

        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.message()).contains("Could not stop Homepage");
        assertThat(Files.exists(runtimeLayout.runtimeRoot().resolve("backups/homepage"))).isFalse();
    }

    private AppLifecycleService appLifecycleService(RuntimeLayout runtimeLayout, InstalledAppRepository repository, MarketplaceCatalogService catalogService, BackupRepository backupRepository) {
        return new AppLifecycleService(
                repository,
                new NoopDockerComposeExecutor(),
                catalogService,
                List::of,
                runtimeLayout,
                new PostInstallGuideBuilder(),
                new TailscaleService(),
                false,
                null,
                backupRepository);
    }

    private BackupService backupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedRepository, BackupRepository backupRepository, MarketplaceCatalogService catalogService) {
        return backupService(runtimeLayout, installedRepository, backupRepository, catalogService, new AutarkOsFileOpsService(runtimeLayout, new LocalAutarkOsFileOperations()));
    }

    private BackupService backupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedRepository, BackupRepository backupRepository, MarketplaceCatalogService catalogService, AutarkOsFileOpsService fileOpsService) {
        return backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService, new NoopDockerComposeExecutor());
    }

    private BackupService backupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedRepository, BackupRepository backupRepository, MarketplaceCatalogService catalogService, AutarkOsFileOpsService fileOpsService, DockerComposeExecutor composeExecutor) {
        return new BackupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                new ActivityLogService(mock(ActivityLogRepository.class)),
                JpaTestRepositories.projectSettingsRepository(runtimeLayout),
                new ProjectSettingsService(JpaTestRepositories.projectSettingsRepository(runtimeLayout), new ActivityLogService(mock(ActivityLogRepository.class))),
                appLifecycleService(runtimeLayout, installedRepository, catalogService, backupRepository, composeExecutor),
                catalogService,
                () -> List.of(appInstance("homepage", "Homepage")),
                new RuntimeFileOperations(),
                fileOpsService);
    }

    private AppLifecycleService appLifecycleService(RuntimeLayout runtimeLayout, InstalledAppRepository repository, MarketplaceCatalogService catalogService, BackupRepository backupRepository, DockerComposeExecutor composeExecutor) {
        return new AppLifecycleService(
                repository,
                composeExecutor,
                catalogService,
                List::of,
                runtimeLayout,
                new PostInstallGuideBuilder(),
                new TailscaleService(),
                false,
                null,
                backupRepository);
    }

    private void writeZip(Path archive, String entryName, String content) throws Exception {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(archive))) {
            zip.putNextEntry(new ZipEntry(entryName));
            zip.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zip.closeEntry();
        }
    }

    private AppInstanceView appInstance(String appId, String name) {
        return new AppInstanceView(
                "appinst_" + appId,
                appId,
                name,
                "General",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                "local_ready",
                "backup_enabled_no_restore_point",
                "http://localhost:8090",
                null,
                List.of(),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));
    }

    private InstalledApp installed(String appId, String name, RuntimeLayout runtimeLayout) throws Exception {
        Path appRoot = runtimeLayout.appRoot(appId);
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services:\n  app:\n    image: test/" + appId + ":latest\n");
        return new InstalledApp(appId, name, "Ready", appRoot.toString(), "autark-os-" + appId, "http://localhost:8090", Instant.parse("2026-06-20T12:00:00Z"));
    }

    private void saveOwned(InstalledAppRepository repository, InstalledApp app) {
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                app.appId(),
                "appinst_" + app.appId(),
                app.appId(),
                "pos_test",
                app.runtimePath(),
                "ready",
                "owned",
                app.installedAt(),
                app.installedAt()));
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static class NoopDockerComposeExecutor implements DockerComposeExecutor {
        @Override
        public RuntimeModels.DockerComposeResult up(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public RuntimeModels.DockerComposeResult restart(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public RuntimeModels.DockerComposeResult down(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public RuntimeModels.DockerComposeResult ps(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public List<RuntimeModels.DockerContainerStatus> containers(Path composeFile, String projectName) {
            return List.of();
        }

        @Override
        public List<RuntimeModels.ContainerTelemetry> stats(List<String> containerNames) {
            return List.of();
        }
    }

    private static class FailingStartDockerComposeExecutor extends NoopDockerComposeExecutor {
        @Override
        public RuntimeModels.DockerComposeResult up(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(1, List.of("failed to bind host port 0.0.0.0:8080/tcp: address already in use"));
        }
    }

    private static class FailingStopDockerComposeExecutor extends NoopDockerComposeExecutor {
        @Override
        public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(1, List.of("container did not stop"));
        }
    }

    private static class RecordingFileOpsService extends AutarkOsFileOpsService {
        private final List<String> restoreCalls = new java.util.ArrayList<>();

        RecordingFileOpsService(RuntimeLayout runtimeLayout) {
            super(runtimeLayout, new LocalAutarkOsFileOperations());
        }

        @Override
        public void restoreAppData(Path archive, String scope, String appId) {
            restoreCalls.add(appId + "|" + scope + "|" + archive.toAbsolutePath().normalize());
        }

        @Override
        public void restoreAppData(Path archive, String scope, String appId, Path approvedBackupRoot) {
            restoreAppData(archive, scope, appId);
        }
    }
}
