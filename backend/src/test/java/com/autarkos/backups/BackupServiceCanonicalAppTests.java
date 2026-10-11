package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

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
import com.autarkos.marketplace.install.AppAccessChecker;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.AppTelemetryService;
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
import com.autarkos.system.AutarkOsIdentity;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.testsupport.ManagedAppTestContract;
import com.autarkos.testsupport.RestorePointTestRecords;

class BackupServiceCanonicalAppTests {

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"homepage", "syncthing"})
    void fullBackupProtectsAppAndRestoresActualFilesDespiteNewerUnverifiedAttempts(String appId) throws Exception {
        RuntimeLayout layout = runtimeLayout();
        InstalledAppRepository installed = JpaTestRepositories.installedAppRepository(layout);
        BackupRepository backups = JpaTestRepositories.backupRepository(layout);
        MarketplaceCatalogService catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp app = installed(appId, appId, layout);
        installed.save(app);
        saveOwned(installed, app);
        installed.saveSettings(app.appId(), new InstallModels.InstallSettings(app.accessUrl(), null, false,
                java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        Path data = layout.appRoot(appId).resolve(appId.equals("syncthing") ? "data/config/settings.yaml" : "config/settings.yaml");
        Files.createDirectories(data.getParent());
        Files.writeString(data, "title: original\n");
        Path syncedData = layout.appRoot(appId).resolve("data/document.txt");
        Files.createDirectories(syncedData.getParent());
        Files.writeString(syncedData, "original document");
        BackupService service = backupService(layout, installed, backups, catalog,
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()), new NoopDockerComposeExecutor(), appId);
        assertThat(service.report().protectedApps()).isZero();
        RestorePoint full = service.runFullBackup("manual").restorePoint();
        assertThat(full.verificationStatus()).isEqualTo("verified");
        for (int i = 0; i < 12; i++) {
            RestorePointTestRecords.record(backups, appId, appId, "app", "manual", appId, "",
                    "completed", 0, "Unverified checkpoint");
        }
        BackupModels.BackupReport report = service.report();
        assertThat(report.protectedApps()).isEqualTo(1);
        assertThat(report.apps().getFirst().latestBackup().verificationStatus()).isNotEqualTo("verified");
        assertThat(report.apps().getFirst().restorePoints()).extracting(RestorePoint::id).contains(full.id());
        assertThat(appLifecycleService(layout, installed, catalog, backups, new NoopDockerComposeExecutor())
                .getApp(appId).backupProtection()).isEqualTo("protected_by_restore_point");
        Files.writeString(data, "title: changed\n");
        Files.writeString(syncedData, "changed document");
        assertThat(service.restorePlan(full.id(), appId).executable()).isTrue();
        if (appId.equals("syncthing")) {
            assertThat(service.restorePlan(full.id(), appId).dryRunDetails()).contains("Declared paths: data");
        }
        assertThat(service.restore(full.id(), appId, service.restorePlan(full.id(), appId).planId()).status()).isEqualTo("completed");
        assertThat(Files.readString(data)).isEqualTo("title: original\n");
        assertThat(Files.readString(syncedData)).isEqualTo(appId.equals("syncthing") ? "original document" : "changed document");
        assertThat(service.restorePlan(full.id(), "vaultwarden").executable()).isFalse();
    }

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
        AutarkOsFileOpsService fileOps = new AutarkOsFileOpsService(runtimeLayout, new LocalAutarkOsFileOperations());

        BackupService service = new BackupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                new ActivityLogService(mock(ActivityLogRepository.class)),
                JpaTestRepositories.projectSettingsRepository(runtimeLayout),
                projectSettingsService(runtimeLayout, installedRepository),
                appLifecycleService(runtimeLayout, installedRepository, catalogService, backupRepository),
                catalogService,
                managedApps(List.of(homepage)),
                new RuntimeFileOperations(),
                fileOps,
                backupDestination(runtimeLayout, fileOps),
                new RecoveryOperationCoordinator(), new com.autarkos.jobs.AutarkOsJobService(JpaTestRepositories.jobRepository(runtimeLayout), Runnable::run, false));

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
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        Files.delete(runtimeLayout.appRoot("homepage").resolve("compose.yaml"));
        BackupService service = backupService(runtimeLayout, installedRepository, backupRepository, catalogService);

        BackupModels.BackupReport report = service.report();
        assertThat(report.apps()).singleElement().satisfies(app -> {
            assertThat(app.status()).isEqualTo("recovery_limited");
            assertThat(app.backupAvailable()).isFalse();
            assertThat(app.backupUnavailableReason()).contains("original Compose file is missing").contains("Review recovery");
        });
        assertThatThrownBy(() -> service.run("homepage"))
                .isInstanceOf(com.autarkos.marketplace.install.InstallationException.class)
                .hasMessageContaining("original Compose configuration is missing");
        BackupModels.BackupRunResult fullBackup = service.runFullBackup("manual");
        assertThat(fullBackup.status()).isEqualTo("failed");
        assertThat(fullBackup.message()).contains("Full backup is unavailable").contains("Homepage");
    }

    @Test
    void backupPreflightUsesTheCanonicalRuntimePathInsteadOfStoredMetadata() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp canonical = installed("homepage", "Homepage", runtimeLayout);
        InstalledApp staleMetadata = new InstalledApp(
                canonical.appId(),
                canonical.appName(),
                canonical.status(),
                runtimeRoot.resolve("outside-autark-os-runtime").toString(),
                canonical.composeProject(),
                canonical.accessUrl(),
                canonical.installedAt());
        installedRepository.save(staleMetadata);
        saveOwned(installedRepository, canonical);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(canonical.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));

        assertThatThrownBy(() -> backupService(runtimeLayout, installedRepository, backupRepository, catalogService).run("homepage"))
                .isInstanceOf(com.autarkos.marketplace.install.InstallationException.class)
                .hasMessageContaining("runtime folder does not match");
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

        RestoreModels.RestoreResult result = service.restore(point.id(), "homepage", service.restorePlan(point.id(), "homepage").planId());

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
        FailingStartDockerComposeExecutor composeExecutor = new FailingStartDockerComposeExecutor();
        BackupService service = backupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                catalogService,
                fileOpsService,
                composeExecutor);

        assertThatThrownBy(() -> service.restore(point.id(), "homepage", service.restorePlan(point.id(), "homepage").planId()))
                .hasMessageContaining("requested restore was rolled back").hasMessageContaining("could not resume");
        assertThat(fileOpsService.restoreCalls).hasSize(2);
        assertThat(fileOpsService.restoreCalls.getFirst()).isEqualTo("homepage|app|" + Path.of(point.path()).toAbsolutePath().normalize());
        assertThat(fileOpsService.restoreCalls.get(1)).contains("homepage|app|").contains("pre-restore");
        assertThat(composeExecutor.stopCalls).isEqualTo(2);
    }

    @Test
    void restoreDoesNotApplySafetyCheckpointWhenRollbackStopCannotBeConfirmed() throws Exception {
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
        FailingRollbackStopDockerComposeExecutor composeExecutor = new FailingRollbackStopDockerComposeExecutor();
        BackupService service = backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService, composeExecutor);

        assertThatThrownBy(() -> service.restore(point.id(), "homepage", service.restorePlan(point.id(), "homepage").planId()))
                .hasMessageContaining("could not restore the safety checkpoint");
        assertThat(fileOpsService.restoreCalls).containsExactly("homepage|app|" + Path.of(point.path()).toAbsolutePath().normalize());
        assertThat(composeExecutor.stopCalls).isEqualTo(2);
    }

    @Test
    void restoreAttemptsSafetyRecoveryWhenAWriteThrowsBeforeReportingCompletion() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        FailingRequestedRestoreFileOpsService fileOpsService = new FailingRequestedRestoreFileOpsService(runtimeLayout);
        RestorePoint point = backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService).run("homepage").restorePoint();
        BackupService service = backupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                catalogService,
                fileOpsService,
                new FailingStartDockerComposeExecutor());

        assertThatThrownBy(() -> service.restore(point.id(), "homepage", service.restorePlan(point.id(), "homepage").planId()))
                .hasMessageContaining("Restore failed for Homepage")
                .hasMessageContaining("requested archive could not be applied");
        assertThat(fileOpsService.restoreCalls).hasSize(2);
        assertThat(fileOpsService.restoreCalls.get(1)).contains("pre-restore");
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
    void archiveChangedAfterRestorePreflightIsBlockedBeforeLiveDataChanges() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp homepage = installed("homepage", "Homepage", runtimeLayout);
        installedRepository.save(homepage);
        saveOwned(installedRepository, homepage);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(homepage.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        TamperingFileOpsService fileOpsService = new TamperingFileOpsService(runtimeLayout);
        BackupService service = backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService);
        RestorePoint point = service.run("homepage").restorePoint();
        fileOpsService.tamperWhenSafetyCheckpointIsCreated(point.path());

        assertThatThrownBy(() -> service.restore(point.id(), "homepage", service.restorePlan(point.id(), "homepage").planId()))
                .hasMessageContaining("integrity changed")
                .hasMessageContaining("checksum")
                .hasMessageContaining("immutable");
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

    @Test
    void pausedAppStaysPausedWithoutStopOrStartDuringBackup() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp ready = installed("homepage", "Homepage", runtimeLayout);
        InstalledApp paused = new InstalledApp(
                ready.appId(), ready.appName(), "Paused", ready.runtimePath(), ready.composeProject(), ready.accessUrl(), ready.installedAt());
        installedRepository.save(paused);
        saveOwned(installedRepository, paused);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(paused.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        NoopDockerComposeExecutor composeExecutor = new NoopDockerComposeExecutor();

        BackupModels.BackupRunResult result = backupService(
                runtimeLayout, installedRepository, backupRepository, catalogService,
                new AutarkOsFileOpsService(runtimeLayout, new LocalAutarkOsFileOperations()), composeExecutor).run("homepage");

        assertThat(result.status()).isEqualTo("completed");
        assertThat(composeExecutor.stopCalls).isZero();
        assertThat(composeExecutor.startCalls).isZero();
    }

    @Test
    void pausedAppStaysPausedWhenBackupPreflightFails() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        InstalledAppRepository installedRepository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout);
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp ready = installed("homepage", "Homepage", runtimeLayout);
        InstalledApp paused = new InstalledApp(
                ready.appId(), ready.appName(), "Paused", ready.runtimePath(), ready.composeProject(), ready.accessUrl(), ready.installedAt());
        installedRepository.save(paused);
        saveOwned(installedRepository, paused);
        installedRepository.saveSettings("homepage", new InstallModels.InstallSettings(paused.accessUrl(), null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        Files.delete(runtimeLayout.appRoot("homepage").resolve("compose.yaml"));
        NoopDockerComposeExecutor composeExecutor = new NoopDockerComposeExecutor();

        assertThatThrownBy(() -> backupService(
                runtimeLayout, installedRepository, backupRepository, catalogService,
                new AutarkOsFileOpsService(runtimeLayout, new LocalAutarkOsFileOperations()), composeExecutor).run("homepage"))
                .isInstanceOf(com.autarkos.marketplace.install.InstallationException.class)
                .hasMessageContaining("original Compose configuration is missing");
        assertThat(composeExecutor.stopCalls).isZero();
        assertThat(composeExecutor.startCalls).isZero();
    }

    private AppLifecycleService appLifecycleService(RuntimeLayout runtimeLayout, InstalledAppRepository repository, MarketplaceCatalogService catalogService, BackupRepository backupRepository) {
        return appLifecycleService(runtimeLayout, repository, catalogService, backupRepository, new NoopDockerComposeExecutor());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void stalePausedRegistrationStillQuiescesLiveWriters(boolean full) throws Exception {
        RuntimeLayout layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var backups = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp app = installed("homepage", "Homepage", layout);
        installed.save(new InstalledApp(app.appId(), app.appName(), "Paused", app.runtimePath(), app.composeProject(), app.accessUrl(), app.installedAt()));
        saveOwned(installed, app);
        var compose = new ObservedWriterDockerComposeExecutor();
        var fileOps = new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations());
        var service = backupService(layout, installed, backups, catalog, fileOps, compose);

        var result = full ? service.runFullBackup("manual") : service.run(app.appId());

        assertThat(result.status()).isEqualTo("completed");
        assertThat(compose.stopCalls).as("live writers must stop even when the saved app status says Paused").isEqualTo(1);
        assertThat(compose.startCalls).isEqualTo(1);
        assertThat(compose.running).isTrue();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void backupResumesAppWhenStopSucceedsButItsObservationFails(boolean full) throws Exception {
        RuntimeLayout layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var backups = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        var compose = new ObservedWriterDockerComposeExecutor();
        compose.failNextStoppedObservation = true;
        var service = backupService(layout, installed, backups, catalog,
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()), compose);

        var result = full ? service.runFullBackup("manual") : service.run(app.appId());

        assertThat(result.status()).isEqualTo("failed");
        assertThat(compose.stopCalls).isEqualTo(1);
        assertThat(compose.startCalls).as("a stop attempt already changed availability before the observation failed").isEqualTo(1);
        assertThat(compose.running).isTrue();
        assertThat(backups.recent(10)).allSatisfy(point -> assertThat(RestorePoints.toDomain(point).status()).isNotEqualTo("completed"));
    }

    @Test
    void restoreResumesAppWhenStopSucceedsButItsObservationFails() throws Exception {
        RuntimeLayout layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var backups = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        RestorePoint point = backupService(layout, installed, backups, catalog).run(app.appId()).restorePoint();
        var compose = new ObservedWriterDockerComposeExecutor();
        compose.failNextStoppedObservation = true;
        var service = backupService(layout, installed, backups, catalog,
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()), compose);

        assertThatThrownBy(() -> service.restore(point.id(), app.appId(), service.restorePlan(point.id(), app.appId()).planId())).hasMessageContaining("stop");

        assertThat(compose.stopCalls).isEqualTo(1);
        assertThat(compose.startCalls).isEqualTo(1);
        assertThat(compose.running).isTrue();
    }

    @Test
    void partialMultiServiceStopBlocksArchiveAndResumesEveryWriter() throws Exception {
        RuntimeLayout layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var backups = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        var compose = new ObservedWriterDockerComposeExecutor() {
            @Override
            public List<RuntimeModels.DockerContainerStatus> containers(Path file, String project) {
                var primary = super.containers(file, project).getFirst();
                return List.of(primary, new RuntimeModels.DockerContainerStatus("writer", "writer", "running", "", "Up", ""));
            }
        };
        var service = backupService(layout, installed, backups, catalog,
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()), compose);
        var result = service.run("homepage");
        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.message()).contains("could not confirm");
        assertThat(result.restorePoint().path()).isEmpty();
        assertThat(compose.startCalls).isEqualTo(1);
        assertThat(compose.running).isTrue();
    }

    @Test
    void failedArchiveResumesWriterAndDoesNotClaimProtection() throws Exception {
        RuntimeLayout layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var backups = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        var compose = new ObservedWriterDockerComposeExecutor();
        var fileOps = new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()) {
            @Override
            public long createManagedArchive(String appId, java.util.Map<String, Path> paths, Path destination, Path root) throws java.io.IOException {
                assertThat(compose.running).as("copy must not overlap live writers").isFalse();
                throw new java.io.IOException("Injected archive write failure");
            }
        };
        var result = backupService(layout, installed, backups, catalog, fileOps, compose).run("homepage");
        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.message()).contains("archive write failure");
        assertThat(compose.startCalls).isEqualTo(1);
        assertThat(compose.running).isTrue();
    }

    @Test
    void failedFailureRecordCannotSkipAvailabilityRecovery() throws Exception {
        RuntimeLayout layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var backups = mock(BackupRepository.class, org.mockito.AdditionalAnswers.delegatesTo(JpaTestRepositories.backupRepository(layout)));
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        var compose = new ObservedWriterDockerComposeExecutor();
        compose.failNextStoppedObservation = true;
        org.mockito.Mockito.doThrow(new IllegalStateException("Failure record could not be saved"))
                .when(backups).save(org.mockito.ArgumentMatchers.any(RestorePointEntity.class));
        var service = backupService(layout, installed, backups, catalog,
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()), compose);
        assertThatThrownBy(() -> service.run("homepage")).hasMessageContaining("Failure record");
        assertThat(compose.startCalls).isEqualTo(1);
        assertThat(compose.running).isTrue();
    }

    @Test
    void successfulRestoreIsNotRolledBackWhenHistoryWriteFails() throws Exception {
        RuntimeLayout layout = runtimeLayout();
        var installed = mock(InstalledAppRepository.class, org.mockito.AdditionalAnswers.delegatesTo(JpaTestRepositories.installedAppRepository(layout)));
        var backups = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        Path data = Path.of(app.runtimePath()).resolve("config/known.txt");
        Files.createDirectories(data.getParent());
        Files.writeString(data, "original records");
        var compose = new ObservedWriterDockerComposeExecutor();
        var service = backupService(layout, installed, backups, catalog,
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()), compose);
        var point = service.run("homepage").restorePoint();
        Files.writeString(data, "changed records");
        org.mockito.Mockito.doThrow(new IllegalStateException("History write failed"))
                .when(installed).recordEvent(org.mockito.ArgumentMatchers.eq("homepage"), org.mockito.ArgumentMatchers.eq("restore_completed"), org.mockito.ArgumentMatchers.anyString());
        assertThatThrownBy(() -> service.restore(point.id(), "homepage", service.restorePlan(point.id(), "homepage").planId())).hasMessageContaining("History write failed");
        assertThat(data).hasContent("original records");
        assertThat(compose.running).isTrue();
        assertThat(compose.stopCalls).isEqualTo(2); // Backup and requested restore; no bookkeeping rollback.
    }

    @Test
    void restoreCannotClaimRunningAfterSuccessfulStartCommandWithStoppedContainers() throws Exception {
        RuntimeLayout layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var backups = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        InstalledApp app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        var point = backupService(layout, installed, backups, catalog).run("homepage").restorePoint();
        var compose = new ObservedWriterDockerComposeExecutor() {
            @Override
            public RuntimeModels.DockerComposeResult up(Path file, String project) {
                var result = super.up(file, project);
                running = false;
                return result;
            }
        };
        var service = backupService(layout, installed, backups, catalog,
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()), compose);
        assertThatThrownBy(() -> service.restore(point.id(), "homepage", service.restorePlan(point.id(), "homepage").planId()))
                .hasMessageContaining("Running containers could not be confirmed").hasMessageContaining("could not resume");
    }

    @Test
    void emptyRoutineAndFailedVerificationNeverClaimVerificationSucceeded() throws Exception {
        var layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var points = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        var app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        installed.saveSettings("homepage", new InstallModels.InstallSettings("", null, false, java.util.Map.of(), new InstallModels.BackupPolicy(false, "weekly", 3)));
        var jobs = new com.autarkos.jobs.AutarkOsJobService(JpaTestRepositories.jobRepository(layout), Runnable::run, false);
        var service = backupService(layout, installed, points, catalog,
                new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()), new NoopDockerComposeExecutor(), "homepage", jobs);
        var empty = jobs.start("backup", "__routine__", BackupJobs.steps(), () -> BackupJobs.outcome(service.runAutomatic(), jobs));
        jobs.runQueuedJobsNow();
        var completed = jobs.findById(empty.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("succeeded");
        assertThat(completed.steps()).extracting(com.autarkos.jobs.AutarkOsJobStep::id).containsExactly("prepare_backup");
        assertThat(completed.steps().getFirst().message()).contains("No archive", "Homepage", "excluded from the routine");
        var point = service.run("homepage").restorePoint();
        Files.writeString(Path.of(point.path()), "tampered", java.nio.file.StandardOpenOption.APPEND);
        var verify = jobs.start("backup_verify", String.valueOf(point.id()),
                java.util.List.of(com.autarkos.jobs.AutarkOsJobStep.pending("load_restore_point", "Loading restore point")), () -> {
                    var result = service.verify(point.id());
                    return BackupJobs.outcome(result.status(), result.message(), jobs);
                });
        jobs.runQueuedJobsNow();
        var failed = jobs.findById(verify.jobId()).orElseThrow();
        assertThat(failed.status()).isEqualTo("failed");
        assertThat(failed.currentStep()).isEqualTo("verify_archive");
        assertThat(failed.steps()).extracting(com.autarkos.jobs.AutarkOsJobStep::status).containsExactly("succeeded", "failed");
    }

    @Test
    void excludedAppCanBeBackedUpManuallyAndCopyFailurePreservesRealProgress() throws Exception {
        var layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var points = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        var app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        installed.saveSettings("homepage", new InstallModels.InstallSettings("", null, false, java.util.Map.of(), new InstallModels.BackupPolicy(false, "monthly", 3)));
        var jobs = new com.autarkos.jobs.AutarkOsJobService(JpaTestRepositories.jobRepository(layout), Runnable::run, false);
        var compose = new ObservedWriterDockerComposeExecutor();
        var files = new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()) {
            @Override
            public long createManagedArchive(String appId, java.util.Map<String, Path> paths, Path destination, Path root) throws java.io.IOException {
                var running = jobs.findById(jobs.executingJobId()).orElseThrow();
                assertThat(running.currentStep()).isEqualTo("copy_data");
                assertThat(running.steps()).extracting(com.autarkos.jobs.AutarkOsJobStep::status)
                        .containsExactly("succeeded", "succeeded", "running");
                // A fresh reader sees persisted progress while the copy is still executing.
                var reloaded = new com.autarkos.jobs.AutarkOsJobService(JpaTestRepositories.jobRepository(layout), Runnable::run, false);
                assertThat(reloaded.findById(running.jobId()).orElseThrow().currentStep()).isEqualTo("copy_data");
                throw new java.io.IOException("Injected copy failure");
            }
        };
        var service = backupService(layout, installed, points, catalog, files, compose, "homepage", jobs);
        assertThat(service.backupUnavailableReason(app)).isEmpty();
        assertThat(service.backupEligibleApps(false)).containsExactly(app);
        assertThat(service.backupEligibleApps(true)).isEmpty();
        var job = jobs.start("backup", "homepage", BackupJobs.steps(), () -> BackupJobs.outcome(service.run("homepage"), jobs));
        jobs.runQueuedJobsNow();
        var failed = jobs.findById(job.jobId()).orElseThrow();
        assertThat(failed.status()).isEqualTo("failed");
        assertThat(failed.currentStep()).isEqualTo("copy_data");
        assertThat(failed.steps()).extracting(com.autarkos.jobs.AutarkOsJobStep::id)
                .containsExactly("prepare_backup", "stop_apps", "copy_data", "resume_apps");
        assertThat(failed.steps()).extracting(com.autarkos.jobs.AutarkOsJobStep::status)
                .containsExactly("succeeded", "succeeded", "failed", "succeeded");
        assertThat(compose.running).isTrue();
    }

    @Test
    void restoreCopyFailureRetainsCompletedSafetyCheckpointAndShowsRollback() throws Exception {
        var layout = runtimeLayout();
        var installed = JpaTestRepositories.installedAppRepository(layout);
        var points = JpaTestRepositories.backupRepository(layout);
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        var app = installed("homepage", "Homepage", layout);
        installed.save(app);
        saveOwned(installed, app);
        var copying = new java.util.concurrent.CountDownLatch(1);
        var releaseCopy = new java.util.concurrent.CountDownLatch(1);
        var finished = new java.util.concurrent.CountDownLatch(1);
        var jobs = new com.autarkos.jobs.AutarkOsJobService(JpaTestRepositories.jobRepository(layout), command ->
                Thread.ofVirtual().start(() -> {
                    try { command.run(); } finally { finished.countDown(); }
                }), false);
        var files = new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()) {
            int restores;
            @Override
            public void restoreAppData(Path archive, String scope, String appId, Path approvedRoot) throws java.io.IOException {
                if (++restores == 1) {
                    var current = jobs.findById(jobs.executingJobId()).orElseThrow();
                    assertThat(current.currentStep()).isEqualTo("restore_data:homepage");
                    assertThat(current.steps()).filteredOn(step -> step.id().equals("create_safety_backup:homepage"))
                            .extracting(com.autarkos.jobs.AutarkOsJobStep::status).containsExactly("succeeded");
                    copying.countDown();
                    try {
                        if (!releaseCopy.await(10, java.util.concurrent.TimeUnit.SECONDS)) throw new java.io.IOException("Copy test was not released");
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        throw new java.io.IOException(interrupted);
                    }
                    throw new java.io.IOException("Injected restore write failure");
                }
                super.restoreAppData(archive, scope, appId, approvedRoot);
            }
        };
        var service = backupService(layout, installed, points, catalog, files, new NoopDockerComposeExecutor(), "homepage", jobs);
        var point = service.run("homepage").restorePoint();
        var job = jobs.start("backup_restore", point.id() + ":homepage",
                java.util.List.of(com.autarkos.jobs.AutarkOsJobStep.pending("validate_restore_point", "Validating restore point")), () -> {
                    var result = service.restore(point.id(), "homepage", service.restorePlan(point.id(), "homepage").planId());
                    return BackupJobs.outcome(result.status(), result.message(), jobs);
                });
        jobs.runQueuedJobsNow();
        try {
            assertThat(copying.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var reloaded = new com.autarkos.jobs.AutarkOsJobService(JpaTestRepositories.jobRepository(layout), Runnable::run, false);
            var running = reloaded.findById(job.jobId()).orElseThrow();
            assertThat(running.status()).isEqualTo("running");
            assertThat(running.currentStep()).isEqualTo("restore_data:homepage");
        } finally {
            releaseCopy.countDown();
        }
        assertThat(finished.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        var failed = jobs.findById(job.jobId()).orElseThrow();
        assertThat(failed.status()).isEqualTo("failed");
        assertThat(failed.steps()).filteredOn(step -> step.id().equals("restore_data:homepage"))
                .extracting(com.autarkos.jobs.AutarkOsJobStep::status).containsExactly("failed");
        assertThat(failed.steps()).filteredOn(step -> step.id().equals("rollback:homepage"))
                .extracting(com.autarkos.jobs.AutarkOsJobStep::status).containsExactly("succeeded");
        assertThat(failed.error().message()).contains("rolled back");
    }

    private BackupService backupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedRepository, BackupRepository backupRepository, MarketplaceCatalogService catalogService) {
        return backupService(runtimeLayout, installedRepository, backupRepository, catalogService, new AutarkOsFileOpsService(runtimeLayout, new LocalAutarkOsFileOperations()));
    }

    private BackupService backupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedRepository, BackupRepository backupRepository, MarketplaceCatalogService catalogService, AutarkOsFileOpsService fileOpsService) {
        return backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService, new NoopDockerComposeExecutor());
    }

    private BackupService backupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedRepository, BackupRepository backupRepository, MarketplaceCatalogService catalogService, AutarkOsFileOpsService fileOpsService, DockerComposeExecutor composeExecutor) {
        return backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService, composeExecutor, "homepage");
    }

    private BackupService backupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedRepository, BackupRepository backupRepository, MarketplaceCatalogService catalogService, AutarkOsFileOpsService fileOpsService, DockerComposeExecutor composeExecutor, String managedAppId) {
        return backupService(runtimeLayout, installedRepository, backupRepository, catalogService, fileOpsService, composeExecutor, managedAppId,
                new com.autarkos.jobs.AutarkOsJobService(JpaTestRepositories.jobRepository(runtimeLayout), Runnable::run, false));
    }

    private BackupService backupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedRepository, BackupRepository backupRepository, MarketplaceCatalogService catalogService, AutarkOsFileOpsService fileOpsService, DockerComposeExecutor composeExecutor, String managedAppId, com.autarkos.jobs.AutarkOsJobService jobs) {
        return new BackupService(
                runtimeLayout,
                installedRepository,
                backupRepository,
                new ActivityLogService(mock(ActivityLogRepository.class)),
                JpaTestRepositories.projectSettingsRepository(runtimeLayout),
                projectSettingsService(runtimeLayout, installedRepository),
                appLifecycleService(runtimeLayout, installedRepository, catalogService, backupRepository, composeExecutor),
                catalogService,
                managedApps(installedRepository.findAllApps().stream()
                        .filter(app -> app.appId().equals(managedAppId)).toList()),
                new RuntimeFileOperations(),
                fileOpsService,
                backupDestination(runtimeLayout, fileOpsService),
                new RecoveryOperationCoordinator(), jobs);
    }

    private BackupDestinationService backupDestination(RuntimeLayout layout, AutarkOsFileOpsService fileOps) {
        return new BackupDestinationService(
                layout,
                JpaTestRepositories.projectSettingsRepository(layout));
    }

    private AppLifecycleService appLifecycleService(RuntimeLayout runtimeLayout, InstalledAppRepository repository, MarketplaceCatalogService catalogService, BackupRepository backupRepository, DockerComposeExecutor composeExecutor) {
        BackupDestinationService backupDestination = mock(BackupDestinationService.class);
        when(backupDestination.activeRoot()).thenReturn(runtimeLayout.runtimeRoot().resolve("backups"));
        return new AppLifecycleService(
                repository,
                composeExecutor,
                catalogService,
                runtimeLayout,
                new PostInstallGuideBuilder(),
                new TailscaleService(),
                new ActivityLogService(mock(ActivityLogRepository.class)),
                backupRepository,
                new AppTelemetryService(composeExecutor),
                backupDestination,
                new RecoveryOperationCoordinator(),
                new AutarkOsFileOpsService(runtimeLayout, new LocalAutarkOsFileOperations()),
                managedApps(repository, runtimeLayout),
                new AppAccessChecker() {
                    @Override
                    public com.autarkos.marketplace.install.models.AccessModels.AppAccessCheck localHealthCheck(String appId, com.autarkos.marketplace.model.ApplicationManifest manifest, String url) {
                        return com.autarkos.marketplace.install.models.AccessModels.AppAccessCheck.reachable(appId, url);
                    }
                },
                com.autarkos.testsupport.DockerInventoryTestData.service(() -> {
                    InstalledApp app = repository.findAllApps().getFirst();
                    return com.autarkos.testsupport.DockerInventoryTestData.fromRuntime(
                            app.appId(), "appinst_" + app.appId(), app.composeProject(),
                            composeExecutor.containers(Path.of(app.runtimePath()).resolve("compose.yaml"), app.composeProject()));
                }), new com.autarkos.jobs.AutarkOsJobService(com.autarkos.testsupport.JpaTestRepositories.jobRepository(runtimeLayout), Runnable::run, false));
    }

    private ProjectSettingsService projectSettingsService(RuntimeLayout layout, InstalledAppRepository repository) {
        return new ProjectSettingsService(JpaTestRepositories.projectSettingsRepository(layout),
                new ActivityLogService(mock(ActivityLogRepository.class)));
    }

    private void writeZip(Path archive, String entryName, String content) throws Exception {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(archive))) {
            zip.putNextEntry(new ZipEntry(entryName));
            zip.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zip.closeEntry();
        }
    }

    private com.autarkos.marketplace.install.ManagedAppAttestationService managedApps(List<InstalledApp> apps) {
        var service = mock(com.autarkos.marketplace.install.ManagedAppAttestationService.class);
        when(service.managedApps()).thenReturn(apps);
        when(service.durableStorage(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenAnswer(invocation -> {
                    InstalledApp app = invocation.getArgument(0);
                    var manifest = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator())
                            .findById(app.appId()).orElseThrow();
                    java.util.Map<String, Path> paths = new java.util.LinkedHashMap<>();
                    for (String path : manifest.runtime().backupPaths()) {
                        Path source = Path.of(app.runtimePath()).resolve(path);
                        Files.createDirectories(source);
                        paths.put(path, source);
                    }
                    return new com.autarkos.marketplace.install.ManagedStorageContractService.Contract(app, paths);
                });
        return service;
    }

    private InstalledApp installed(String appId, String name, RuntimeLayout runtimeLayout) throws Exception {
        Path appRoot = runtimeLayout.appRoot(appId);
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services:\n  app:\n    image: test/" + appId + ":latest\n");
        return new InstalledApp(appId, name, "Ready", appRoot.toString(), "autarkos_test_" + appId, "http://localhost:8090", Instant.parse("2026-06-20T12:00:00Z"));
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
        ManagedAppTestContract.writeAll(repository, runtimeLayout(), new AutarkOsIdentity(
                "pos_test", "test", runtimeRoot.toString(), "runtime-hash",
                Instant.parse("2026-06-20T12:00:00Z"), 1));
    }

    private com.autarkos.marketplace.install.ManagedAppAttestationService managedApps(
            InstalledAppRepository repository, RuntimeLayout layout) {
        AutarkOsIdentity identity = new AutarkOsIdentity("pos_test", "test", runtimeRoot.toString(),
                "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1);
        return ManagedAppTestContract.service(repository, layout, identity);
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static class NoopDockerComposeExecutor implements DockerComposeExecutor {
        boolean observedRunning;
        int stopCalls;
        int startCalls;
        @Override
        public RuntimeModels.DockerComposeResult up(Path composeFile, String projectName) {
            startCalls++;
            observedRunning = true;
            return new RuntimeModels.DockerComposeResult(0, List.of());
        }

        @Override
        public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
            stopCalls++;
            observedRunning = false;
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
            String service = projectName.replaceFirst("^autark-os-", "");
            return List.of(new RuntimeModels.DockerContainerStatus(service, service,
                    observedRunning ? "running" : "exited", "", observedRunning ? "Up" : "Exited", ""));
        }

        @Override
        public List<RuntimeModels.ContainerTelemetry> stats(List<String> containerNames) {
            return List.of();
        }
    }

    private static class FailingStartDockerComposeExecutor extends ObservedWriterDockerComposeExecutor {
        @Override
        public RuntimeModels.DockerComposeResult up(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(1, List.of("failed to bind host port 0.0.0.0:8080/tcp: address already in use"));
        }
    }

    private static class ObservedWriterDockerComposeExecutor extends NoopDockerComposeExecutor {
        boolean running = true;
        boolean failNextStoppedObservation;

        @Override
        public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
            running = false;
            return super.stop(composeFile, projectName);
        }

        @Override
        public RuntimeModels.DockerComposeResult up(Path composeFile, String projectName) {
            running = true;
            return super.up(composeFile, projectName);
        }

        @Override
        public List<RuntimeModels.DockerContainerStatus> containers(Path composeFile, String projectName) {
            if (!running && failNextStoppedObservation) {
                failNextStoppedObservation = false;
                throw new IllegalStateException("Docker observation failed after the stop succeeded");
            }
            return List.of(new RuntimeModels.DockerContainerStatus("homepage", "homepage",
                    running ? "running" : "exited", "", running ? "Up" : "Exited", ""));
        }
    }

    private static class FailingStopDockerComposeExecutor extends ObservedWriterDockerComposeExecutor {
        @Override
        public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
            return new RuntimeModels.DockerComposeResult(1, List.of("container did not stop"));
        }
    }

    private static class FailingRollbackStopDockerComposeExecutor extends FailingStartDockerComposeExecutor {
        @Override
        public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
            if (stopCalls == 0) return super.stop(composeFile, projectName);
            stopCalls++;
            return new RuntimeModels.DockerComposeResult(1, List.of("container could not be stopped before rollback"));
        }
    }

    private static class RecordingFileOpsService extends AutarkOsFileOpsService {
        protected final List<String> restoreCalls = new java.util.ArrayList<>();

        RecordingFileOpsService(RuntimeLayout runtimeLayout) {
            super(runtimeLayout, new LocalAutarkOsFileOperations());
        }

        @Override
        public void restoreAppData(Path archive, String scope, String appId) throws java.io.IOException {
            restoreCalls.add(appId + "|" + scope + "|" + archive.toAbsolutePath().normalize());
        }

        @Override
        public void restoreAppData(Path archive, String scope, String appId, Path approvedBackupRoot) throws java.io.IOException {
            restoreAppData(archive, scope, appId);
        }
    }

    private static class TamperingFileOpsService extends RecordingFileOpsService {
        private Path archiveToTamper;

        TamperingFileOpsService(RuntimeLayout runtimeLayout) {
            super(runtimeLayout);
        }

        void tamperWhenSafetyCheckpointIsCreated(String archive) {
            archiveToTamper = Path.of(archive);
        }

        @Override
        public long createManagedArchive(String appId, java.util.Map<String, Path> paths, Path destination, Path approvedBackupRoot) throws java.io.IOException {
            long size = super.createManagedArchive(appId, paths, destination, approvedBackupRoot);
            if (archiveToTamper != null) {
                Files.writeString(archiveToTamper, "tampered", java.nio.file.StandardOpenOption.APPEND);
                archiveToTamper = null;
            }
            return size;
        }
    }

    private static class FailingRequestedRestoreFileOpsService extends RecordingFileOpsService {
        FailingRequestedRestoreFileOpsService(RuntimeLayout runtimeLayout) {
            super(runtimeLayout);
        }

        @Override
        public void restoreAppData(Path archive, String scope, String appId) throws java.io.IOException {
            super.restoreAppData(archive, scope, appId);
            throw new java.io.IOException("requested archive could not be applied");
        }
    }
}
