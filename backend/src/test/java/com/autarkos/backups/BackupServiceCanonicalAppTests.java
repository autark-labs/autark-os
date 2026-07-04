package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.autarkos.fileops.LocalAutarkOsFileOperations;
import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.BackupPolicy;
import com.autarkos.marketplace.install.DockerComposeExecutor;
import com.autarkos.marketplace.install.DockerComposeResult;
import com.autarkos.marketplace.install.DockerContainerStatus;
import com.autarkos.marketplace.install.InstallSettings;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.InstalledAppOwnershipMetadata;
import com.autarkos.marketplace.install.PostInstallGuideBuilder;
import com.autarkos.marketplace.install.ContainerTelemetry;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.system.ProjectSettingsRepository;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.RuntimeFileOperations;

class BackupServiceCanonicalAppTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void reportOnlyIncludesCanonicalManagedApps() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = new InstalledAppRepository(runtimeLayout);
        BackupRepository backupRepository = new BackupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        InstalledApp staleVaultwarden = installed("vaultwarden", "Vaultwarden", runtimeLayout);
        installedRepository.save(homepage);
        installedRepository.save(staleVaultwarden);
        installedRepository.saveSettings("homepage", new InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new BackupPolicy(true, "daily", 7)));
        installedRepository.saveSettings("vaultwarden", new InstallSettings(staleVaultwarden.accessUrl(), null, false, java.util.Map.of(), new BackupPolicy(true, "daily", 7)));

        BackupService service = new BackupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                new ActivityLogService(mock(ActivityLogRepository.class)),
                new ProjectSettingsRepository(runtimeLayout),
                new ProjectSettingsService(new ProjectSettingsRepository(runtimeLayout), new ActivityLogService(mock(ActivityLogRepository.class))),
                appLifecycleService(runtimeLayout, installedRepository, catalogService, backupRepository),
                catalogService,
                () -> List.of(appInstance("homepage", "Homepage")),
                new RuntimeFileOperations());

        BackupReport report = service.report();

        assertThat(report.totalApps()).isEqualTo(1);
        assertThat(report.apps()).extracting(AppBackupStatus::appId).containsExactly("homepage");
    }

    @Test
    void backupEnabledWithoutRestorePointIsNotProtected() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = new InstalledAppRepository(runtimeLayout);
        BackupRepository backupRepository = new BackupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        installedRepository.saveSettings("homepage", new InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new BackupPolicy(true, "daily", 7)));

        BackupReport report = backupService(runtimeLayout, installedRepository, backupRepository, catalogService).report();

        assertThat(report.protectedApps()).isZero();
        assertThat(report.status()).isEqualTo("attention");
        assertThat(report.summary()).isEqualTo("0 of 1 apps are protected by a restore point.");
        assertThat(report.apps()).singleElement().satisfies(app -> {
            assertThat(app.status()).isEqualTo("not_backed_up");
            assertThat(app.protectedByBackups()).isFalse();
            assertThat(app.message()).isEqualTo("No restore point yet.");
        });
    }

    @Test
    void completedRestorePointMakesAppProtected() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = new InstalledAppRepository(runtimeLayout);
        BackupRepository backupRepository = new BackupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        installedRepository.saveSettings("homepage", new InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new BackupPolicy(true, "daily", 7)));
        backupRepository.record("homepage", "Homepage", "app", "manual", "homepage", "/backups/homepage.tar", "completed", 1024, "Backup completed.");

        BackupReport report = backupService(runtimeLayout, installedRepository, backupRepository, catalogService).report();

        assertThat(report.protectedApps()).isEqualTo(1);
        assertThat(report.status()).isEqualTo("protected");
        assertThat(report.summary()).isEqualTo("1 of 1 apps are protected by a restore point.");
        assertThat(report.apps()).singleElement().satisfies(app -> {
            assertThat(app.status()).isEqualTo("protected");
            assertThat(app.protectedByBackups()).isTrue();
            assertThat(app.message()).isEqualTo("Protected by restore point.");
        });
    }

    @Test
    void restoreUsesAutarkOsFileOpsServiceForAppDataReplacement() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = new InstalledAppRepository(runtimeLayout);
        BackupRepository backupRepository = new BackupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new BackupPolicy(true, "daily", 7)));
        Path archive = runtimeLayout.runtimeRoot().resolve("backups/full/autark-os-full-test.zip");
        Files.createDirectories(archive.getParent());
        writeZip(archive, "homepage/config/settings.yaml", "title: restored\n");
        RestorePoint point = backupRepository.record("__full__", "All apps", "full", "manual", "homepage", archive.toString(), "completed", Files.size(archive), "Full backup completed.");
        RecordingFileOpsService fileOpsService = new RecordingFileOpsService(runtimeLayout);
        BackupService service = backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService);

        RestoreResult result = service.restore(point.id(), "homepage");

        assertThat(result.status()).as(String.join("\n", result.logs())).isEqualTo("completed");
        assertThat(fileOpsService.restoreCalls).containsExactly("homepage|full|" + archive.toAbsolutePath().normalize());
    }

    @Test
    void restoreReportsWarningWhenAppDataRestoresButAppCannotRestart() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = new InstalledAppRepository(runtimeLayout);
        BackupRepository backupRepository = new BackupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new BackupPolicy(true, "daily", 7)));
        Path archive = runtimeLayout.runtimeRoot().resolve("backups/full/autark-os-full-test.zip");
        Files.createDirectories(archive.getParent());
        writeZip(archive, "homepage/config/settings.yaml", "title: restored\n");
        RestorePoint point = backupRepository.record("__full__", "All apps", "full", "manual", "homepage", archive.toString(), "completed", Files.size(archive), "Full backup completed.");
        RecordingFileOpsService fileOpsService = new RecordingFileOpsService(runtimeLayout);
        BackupService service = backupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                catalogService,
                fileOpsService,
                new FailingStartDockerComposeExecutor());

        RestoreResult result = service.restore(point.id(), "homepage");

        assertThat(result.status()).isEqualTo("warning");
        assertThat(result.message()).contains("could not restart");
        assertThat(result.logs()).anySatisfy(log -> assertThat(log).contains("Autark-OS could not start Homepage"));
        assertThat(fileOpsService.restoreCalls).containsExactly("homepage|full|" + archive.toAbsolutePath().normalize());
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
                new ProjectSettingsRepository(runtimeLayout),
                new ProjectSettingsService(new ProjectSettingsRepository(runtimeLayout), new ActivityLogService(mock(ActivityLogRepository.class))),
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
        repository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
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
        public DockerComposeResult up(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public DockerComposeResult stop(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public DockerComposeResult restart(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public DockerComposeResult down(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public DockerComposeResult ps(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of());
        }

        @Override
        public List<DockerContainerStatus> containers(Path composeFile, String projectName) {
            return List.of();
        }

        @Override
        public List<ContainerTelemetry> stats(List<String> containerNames) {
            return List.of();
        }
    }

    private static class FailingStartDockerComposeExecutor extends NoopDockerComposeExecutor {
        @Override
        public DockerComposeResult up(Path composeFile, String projectName) {
            return new DockerComposeResult(1, List.of("failed to bind host port 0.0.0.0:8080/tcp: address already in use"));
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
    }
}
