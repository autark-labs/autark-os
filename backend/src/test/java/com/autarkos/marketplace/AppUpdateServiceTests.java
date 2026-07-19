package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.quality.Strictness;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.backups.BackupModels;
import com.autarkos.backups.BackupService;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.backups.RestorePoint;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppHealthSnapshot;
import com.autarkos.marketplace.install.AppRuntimeMetadataReader;
import com.autarkos.marketplace.install.AppRuntimeMetadataWriter;
import com.autarkos.marketplace.install.AppUpdateService;
import com.autarkos.marketplace.install.AppUpdateSnapshot;
import com.autarkos.marketplace.install.AppUpdateSnapshotStore;
import com.autarkos.marketplace.install.CatalogPackageCopier;
import com.autarkos.marketplace.install.DockerComposeExecutor;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.install.models.UpdateModels;
import com.autarkos.marketplace.model.ApplicationManifest;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AppUpdateServiceTests {

    @TempDir
    Path temporaryDirectory;

    @Mock
    InstalledAppRepository installedApps;
    @Mock
    MarketplaceCatalogService catalog;
    @Mock
    AppRuntimeMetadataWriter metadataWriter;
    @Mock
    CatalogPackageCopier catalogPackageCopier;
    @Mock
    DockerComposeExecutor composeExecutor;
    @Mock
    BackupService backupService;
    @Mock
    com.autarkos.marketplace.install.AppLifecycleService lifecycleService;
    @Mock
    AppUpdateSnapshotStore snapshots;
    @Mock
    ActivityLogService activityLog;

    private AppUpdateService service;
    private InstalledApp app;
    private ApplicationManifest target;

    @BeforeEach
    void setUp() throws Exception {
        Path appRoot = temporaryDirectory.resolve("example");
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("manifest.yaml"), manifest("1.0.0", "example/app:1.0.0", "8080:80"));
        Files.writeString(appRoot.resolve("compose.yaml"), "services:\n  example:\n    image: example/app:1.0.0\n");
        Files.writeString(appRoot.resolve("autark-os-app.json"), """
                {"appInstanceId":"instance-example","catalogAppId":"example","instanceId":"autark","composeProject":"autark-os-example","manifestVersion":"1.0.0","createdAt":"2026-07-19T00:00:00Z"}
                """);
        app = new InstalledApp("example", "Example", "Ready", appRoot.toString(), "autark-os-example", "http://localhost:8080", Instant.now());
        ManifestYamlReader reader = new ManifestYamlReader();
        target = reader.read(new org.springframework.core.io.ByteArrayResource(manifest("1.1.0", "example/app:1.1.0", "8080:80").getBytes()));
        service = new AppUpdateService(
                installedApps,
                catalog,
                reader,
                new AppRuntimeMetadataReader(),
                metadataWriter,
                catalogPackageCopier,
                composeExecutor,
                backupService,
                lifecycleService,
                snapshots,
                activityLog);

        when(installedApps.findAppById("example")).thenReturn(Optional.of(app));
        when(installedApps.ownershipFor("example")).thenReturn(Optional.of(new RuntimeModels.InstalledAppOwnershipMetadata(
                "example", "instance-example", "example", "autark", app.runtimePath(), "ready", AutarkOsStates.OwnershipState.OWNED_MANAGED, Instant.now(), Instant.now())));
        when(installedApps.settingsFor("example")).thenReturn(Optional.of(InstallModels.InstallSettings.defaults(app.accessUrl())));
        when(catalog.findById("example")).thenReturn(Optional.of(target));
        when(backupService.destination()).thenReturn(new BackupModels.BackupDestination(
                "local", "ready", temporaryDirectory.toString(), temporaryDirectory.toString(), "test", "tmpfs", true, true, 10_000_000L, false, "Ready", "", Instant.now()));
        when(snapshots.activeFor("example")).thenReturn(Optional.empty());
        when(snapshots.latestRollbackFor("example")).thenReturn(Optional.empty());
        when(composeExecutor.imageDigests(any())).thenReturn(Map.of(
                "example/app:1.0.0", "example/app@sha256:old",
                "example/app:1.1.0", "example/app@sha256:new"));
        when(composeExecutor.pull(any(), eq("autark-os-example"))).thenReturn(new RuntimeModels.DockerComposeResult(0, List.of("pulled")));
        when(composeExecutor.up(any(), eq("autark-os-example"))).thenReturn(new RuntimeModels.DockerComposeResult(0, List.of("started")));
        when(lifecycleService.healthSnapshot("example")).thenReturn(new AppHealthSnapshot(
                "example", AutarkOsStates.AppStatus.READY, "Ready", "", "running", "reachable", "not_enabled", false, Instant.now()));
    }

    @Test
    void plansAndAppliesAnImageOnlyUpdateWithPinnedImagesAndRollbackCheckpoint() {
        UpdateModels.AppUpdatePlan plan = service.updatePlan("example");

        assertThat(plan.canApply()).isTrue();
        assertThat(plan.currentVersion()).isEqualTo("1.0.0");
        assertThat(plan.targetVersion()).isEqualTo("1.1.0");

        AppUpdateSnapshot snapshot = snapshot("update_1", "1.0.0", "1.1.0");
        when(snapshots.create(eq(app), eq("update"), eq("1.0.0"), eq("1.1.0"), eq(42L), any())).thenReturn(snapshot);
        runWithSafetyCheckpoint();

        service.update("example", ignored -> { });

        assertThat(readCompose()).contains("example/app@sha256:new");
        ArgumentCaptor<String> snapshotCompose = ArgumentCaptor.forClass(String.class);
        verify(snapshots).create(eq(app), eq("update"), eq("1.0.0"), eq("1.1.0"), eq(42L), snapshotCompose.capture());
        assertThat(snapshotCompose.getValue()).contains("example/app@sha256:old");
        verify(catalogPackageCopier).copyManifest(target, Path.of(app.runtimePath()));
        verify(metadataWriter).write(target, Path.of(app.runtimePath()), "instance-example", "autark-os-example");
        verify(snapshots).updateStatus(snapshot, "rollback_available", "Release 1.0.0 is ready for rollback.");
    }

    @Test
    void restoresTheSavedReleaseWhenTheTargetCannotStart() {
        AppUpdateSnapshot snapshot = snapshot("update_1", "1.0.0", "1.1.0");
        when(snapshots.create(eq(app), eq("update"), eq("1.0.0"), eq("1.1.0"), eq(42L), any())).thenReturn(snapshot);
        runWithSafetyCheckpoint();
        when(composeExecutor.up(any(), eq("autark-os-example")))
                .thenReturn(new RuntimeModels.DockerComposeResult(1, List.of("target failed")))
                .thenReturn(new RuntimeModels.DockerComposeResult(0, List.of("restored")));

        assertThatThrownBy(() -> service.update("example", ignored -> { }))
                .hasMessageContaining("restored the previous release");

        verify(snapshots).restore(snapshot, app);
        verify(snapshots).updateStatus(snapshot, "rolled_back", "Autark-OS restored this release after a failed change.");
    }

    @Test
    void blocksAnyReleaseThatChangesTheRuntimeLayout() throws Exception {
        ApplicationManifest changedTarget = new ManifestYamlReader().read(new org.springframework.core.io.ByteArrayResource(
                manifest("1.1.0", "example/app:1.1.0", "8181:80").getBytes()));
        when(catalog.findById("example")).thenReturn(Optional.of(changedTarget));

        UpdateModels.AppUpdatePlan plan = service.updatePlan("example");

        assertThat(plan.canApply()).isFalse();
        assertThat(plan.blockedReasons()).anyMatch(reason -> reason.contains("runtime layout"));
    }

    @SuppressWarnings("unchecked")
    private void runWithSafetyCheckpoint() {
        RestorePoint point = new RestorePoint(
                42L, "example", "Example", "app", "update_safety", "example", AutarkOsStates.RestorePointStatus.COMPLETED,
                temporaryDirectory.resolve("checkpoint.zip").toString(), 1L, "Backup completed.", AutarkOsStates.RestorePointStatus.VERIFIED,
                "Verified", "checksum", "integrity", "cold_file", 1, "verified", Instant.now(), Instant.now());
        BackupModels.BackupRunResult backup = new BackupModels.BackupRunResult("example", "Example", AutarkOsStates.RestorePointStatus.COMPLETED, "Backup completed.", point, Instant.now());
        when(backupService.runWithUpdateSafetyCheckpoint(eq("example"), eq(RecoveryOperationCoordinator.Operation.APP_UPDATE), any()))
                .thenAnswer(invocation -> ((Function<BackupModels.BackupRunResult, Object>) invocation.getArgument(2)).apply(backup));
    }

    private AppUpdateSnapshot snapshot(String id, String from, String to) {
        return new AppUpdateSnapshot(id, "example", "Example", "update", from, to, temporaryDirectory.resolve(id).toString(), 42L, "applying", "", Instant.now(), Instant.now());
    }

    private String readCompose() {
        try {
            return Files.readString(Path.of(app.runtimePath()).resolve("compose.yaml"));
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private String manifest(String version, String image, String port) {
        return """
                id: example
                metadata:
                  name: Example
                  category: Test
                  description: Test app
                  version: %s
                  image: /app-images/example.svg
                runtime:
                  containerName: example
                  composeProject: autark-os-example
                  image: %s
                  network: autark-os-apps
                  runtimeRoot: /var/lib/autark-os/apps/example
                  ports:
                    - %s
                  volumes:
                    - /var/lib/autark-os/apps/example/data:/data
                  environment:
                    - EXAMPLE=true
                  labels:
                    - autark-os.managed=true
                    - autark-os.app-id=example
                    - autark-os.version=%s
                  backupPaths:
                    - data
                  backupStrategy: cold_file
                  backupContractVersion: 1
                """.formatted(version, image, port, version);
    }
}
