package com.autarkos.apps.recovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.apps.ApplicationInventoryService;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.backups.BackupService;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppAccessChecker;
import com.autarkos.marketplace.install.AppRuntimeMetadataReader;
import com.autarkos.marketplace.install.AppRuntimeMetadataWriter;
import com.autarkos.marketplace.install.CatalogPackageCopier;
import com.autarkos.marketplace.install.ComposeRenderer;
import com.autarkos.marketplace.install.DockerComposeExecutor;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.system.AutarkOsIdentity;

class AppRecoveryServiceTests {

    @TempDir
    Path runtimeRoot;

    private ApplicationInventoryService applicationInventory;
    private ObservedServiceService observedServices;
    private InstalledAppRepository installedApps;
    private MarketplaceCatalogService catalog;
    private DockerOwnershipService dockerOwnership;
    private ActivityLogService activityLog;
    private ApplicationStateService applicationState;
    private AppRecoveryService service;
    private ApplicationManifest manifest;

    @BeforeEach
    void setUp() {
        applicationInventory = mock(ApplicationInventoryService.class);
        observedServices = mock(ObservedServiceService.class);
        installedApps = mock(InstalledAppRepository.class);
        catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        dockerOwnership = mock(DockerOwnershipService.class);
        activityLog = mock(ActivityLogService.class);
        applicationState = mock(ApplicationStateService.class);
        when(dockerOwnership.currentIdentity()).thenReturn(new AutarkOsIdentity(
                "current-instance", "autark-os", runtimeRoot.toString(), "runtime-hash", Instant.EPOCH, 1));
        when(dockerOwnership.composeProject("vaultwarden")).thenReturn("autarkos_current_vaultwarden");
        manifest = catalog.findById("vaultwarden").orElseThrow();
        service = new AppRecoveryService(
                applicationInventory,
                observedServices,
                installedApps,
                catalog,
                new AppRuntimeMetadataReader(),
                dockerOwnership,
                activityLog,
                applicationState,
                com.autarkos.testsupport.DockerInventoryTestData.service(com.autarkos.testsupport.DockerInventoryTestData.empty()));
    }

    @Test
    void restoresOnlyALostCurrentInstanceRegistrationWithExactSettings() throws Exception {
        Path appRoot = writeRuntime(true);
        ObservedService evidence = evidence("owned_managed", appRoot, "current-instance");
        InstallModels.InstallSettings settings = InstallModels.InstallSettings.defaults("http://localhost:8090");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden")).thenReturn(Optional.of(settings));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");
        var result = service.apply("vaultwarden", new AppRecoveryModels.RecoveryApplyRequest(plan.planId(), false));

        assertThat(plan.reason()).isEqualTo("current_instance_registration_lost");
        assertThat(plan.applicable()).isTrue();
        assertThat(result.ok()).isTrue();
        verify(installedApps).commitRecoveredApp(any(InstalledApp.class), any(), any());
    }

    @Test
    void restoresALostRegistrationWithoutChangingAStoppedAppsRuntimeState() throws Exception {
        Path appRoot = writeRuntime(true);
        ObservedService evidence = evidence("owned_managed", appRoot, "current-instance", "stopped");
        InstallModels.InstallSettings settings = InstallModels.InstallSettings.defaults("http://localhost:8090");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden")).thenReturn(Optional.of(settings));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");
        service.apply("vaultwarden", new AppRecoveryModels.RecoveryApplyRequest(plan.planId(), false));

        verify(installedApps).commitRecoveredApp(
                argThat(app -> "Stopped".equals(app.status())), eq(settings), any());
    }

    @Test
    void previousInstancePlanRequiresExplicitOwnershipTransfer() throws Exception {
        Path appRoot = writeRuntime(true);
        ObservedService evidence = evidence("foreign_autark_os", appRoot, "previous-instance");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden")).thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");
        assertThat(plan.reason()).isEqualTo("previous_instance");
        assertThat(plan.applicable()).isTrue();
        assertThat(plan.ownershipTransferRequired()).isTrue();
        assertThat(service.reviewedPlanMatches(
                plan,
                new AppRecoveryModels.RecoveryApplyRequest(plan.planId(), false))).isFalse();
        verify(installedApps, never()).save(any(InstalledApp.class));
    }

    @Test
    void missingComposeRemainsBlockedAndDoesNotCreateARegistration() throws Exception {
        Path appRoot = writeRuntime(false);
        ObservedService evidence = evidence("owned_managed", appRoot, "current-instance");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden")).thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");
        assertThat(plan.applicable()).isFalse();
        assertThat(plan.checks()).filteredOn(check -> check.id().equals("compose"))
                .singleElement().satisfies(check -> assertThat(check.message()).contains("missing"));
        verify(installedApps, never()).save(any(InstalledApp.class));
    }

    @Test
    void missingSavedReleaseManifestCannotProduceAPartiallyManagedApp() throws Exception {
        Path appRoot = writeRuntime(true);
        Files.delete(appRoot.resolve("manifest.yaml"));
        ObservedService evidence = evidence("owned_managed", appRoot, "current-instance");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden"))
                .thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");

        assertThat(plan.applicable()).isFalse();
        assertThat(plan.checks()).filteredOn(check -> check.id().equals("release_manifest"))
                .singleElement().satisfies(check -> assertThat(check.status()).isEqualTo("blocked"));
        verify(installedApps, never()).commitRecoveredApp(any(), any(), any());
    }

    @Test
    void composeImageMustMatchTheSavedReleaseBeingRecovered() throws Exception {
        Path appRoot = writeRuntime(true);
        Files.writeString(appRoot.resolve("compose.yaml"), Files.readString(appRoot.resolve("compose.yaml"))
                .replace(manifest.runtime().image(), "example.invalid/unverified:latest"));
        ObservedService evidence = evidence("owned_managed", appRoot, "current-instance");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden"))
                .thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");

        assertThat(plan.applicable()).isFalse();
        assertThat(plan.checks()).filteredOn(check -> check.id().equals("compose"))
                .singleElement().satisfies(check -> assertThat(check.message()).contains("image"));
        verify(installedApps, never()).commitRecoveredApp(any(), any(), any());
    }

    @Test
    void runningContainerMountsMustMatchTheSavedRelease() throws Exception {
        Path appRoot = writeRuntime(true);
        ObservedService evidence = evidence(
                "owned_managed", appRoot, "current-instance", "running",
                appRoot.resolve("unexpected-data"), manifest.runtime().image());
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden"))
                .thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");

        assertThat(plan.applicable()).isFalse();
        assertThat(plan.checks()).filteredOn(check -> check.id().equals("live_runtime"))
                .singleElement().satisfies(check -> assertThat(check.message()).contains("mounts differ"));
    }

    @Test
    void runningContainerImageMustMatchTheSavedRelease() throws Exception {
        Path appRoot = writeRuntime(true);
        ObservedService evidence = evidence(
                "owned_managed", appRoot, "current-instance", "running",
                appRoot.resolve("data"), "example.invalid/drifted:latest");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden"))
                .thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");

        assertThat(plan.applicable()).isFalse();
        assertThat(plan.checks()).filteredOn(check -> check.id().equals("live_runtime"))
                .singleElement().satisfies(check -> assertThat(check.message()).contains("image"));
    }

    @Test
    void currentInstanceRegistrationIsBlockedWhenComposeProjectDoesNotMatch() throws Exception {
        Path appRoot = writeRuntime(true);
        markPreviousProject(appRoot);
        ObservedService evidence = evidence("owned_managed", appRoot, "current-instance");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden"))
                .thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");

        assertThat(plan.applicable()).isFalse();
        assertThat(plan.checks()).filteredOn(check -> check.id().equals("compose_project"))
                .singleElement().satisfies(check -> assertThat(check.message()).contains("does not match"));
        verify(installedApps, never()).commitRecoveredApp(any(), any(), any());
    }

    @Test
    void unmanagedContainerIsInsufficientEvidence() throws Exception {
        Path appRoot = writeRuntime(true);
        ObservedService evidence = evidence("external_docker", appRoot, "");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden")).thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");

        assertThat(plan.reason()).isEqualTo("insufficient_evidence");
        assertThat(plan.applicable()).isFalse();
        assertThat(plan.checks()).filteredOn(check -> check.id().equals("docker_ownership"))
                .singleElement().satisfies(check -> assertThat(check.status()).isEqualTo("blocked"));
    }

    @Test
    void transfersPreviousInstanceOnlyAfterCheckpointAndCommitsCurrentOwnershipLast() throws Exception {
        Path appRoot = writeRuntime(true);
        markPreviousProject(appRoot);
        Files.createDirectories(appRoot.resolve("data"));
        AtomicBoolean transferred = new AtomicBoolean(false);
        ObservedService previous = evidence("foreign_autark_os", appRoot, "previous-instance");
        ObservedService current = evidence("owned_managed", appRoot, "current-instance");
        when(observedServices.matchingCatalogServices("vaultwarden"))
                .thenAnswer(ignored -> List.of(transferred.get() ? current : previous));
        when(observedServices.observedServices()).thenAnswer(ignored -> List.of(transferred.get() ? current : previous));
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden"))
                .thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        DockerComposeExecutor compose = mock(DockerComposeExecutor.class);
        ComposeRenderer renderer = mock(ComposeRenderer.class);
        AppRuntimeMetadataWriter metadataWriter = mock(AppRuntimeMetadataWriter.class);
        BackupService backups = mock(BackupService.class);
        TailscaleService tailscale = mock(TailscaleService.class);
        AppAccessChecker access = mock(AppAccessChecker.class);
        when(compose.down(any(), any())).thenReturn(success("stopped previous project"));
        when(compose.up(any(), any())).thenAnswer(ignored -> {
            transferred.set(true);
            return success("started current project");
        });
        when(compose.containers(any(), any())).thenReturn(List.of(
                new RuntimeModels.DockerContainerStatus("vaultwarden", "vaultwarden", "running", "healthy", "Up", "8090:80")));
        when(access.shouldCheckLocalAccess(any(), any())).thenReturn(true);
        when(access.localHealthCheck(any(), any(), any()))
                .thenReturn(AccessModels.AppAccessCheck.reachable("vaultwarden", "http://localhost:8090"));

        AppRecoveryService transactional = completeService(compose, renderer, metadataWriter, backups, tailscale, access);
        AppRecoveryModels.RecoveryPlan plan = transactional.plan("vaultwarden");
        var result = transactional.apply("vaultwarden", new AppRecoveryModels.RecoveryApplyRequest(plan.planId(), true));

        assertThat(result.ok()).isTrue();
        assertThat(plan.ownershipTransferRequired()).isTrue();
        var order = inOrder(backups, compose, renderer, metadataWriter, installedApps);
        order.verify(compose).down(eq(appRoot.resolve("compose.yaml")), eq(plan.sourceComposeProject()));
        order.verify(backups).createRecoveryCheckpoint("vaultwarden", "Vaultwarden");
        order.verify(renderer).transferOwnership(appRoot.resolve("compose.yaml"), manifest,
                "appinst_vaultwarden", "autarkos_current_vaultwarden");
        order.verify(metadataWriter).write(manifest, appRoot, "appinst_vaultwarden", "autarkos_current_vaultwarden");
        order.verify(compose).up(eq(appRoot.resolve("compose.yaml")), eq("autarkos_current_vaultwarden"));
        order.verify(installedApps).commitRecoveredApp(any(InstalledApp.class), any(), any());
    }

    @Test
    void rejectsAPlanWhenComposeChangesAfterReview() throws Exception {
        Path appRoot = writeRuntime(true);
        ObservedService evidence = evidence("owned_managed", appRoot, "current-instance");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden"))
                .thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));
        AppRecoveryModels.RecoveryPlan reviewed = service.plan("vaultwarden");
        Files.writeString(appRoot.resolve("compose.yaml"), Files.readString(appRoot.resolve("compose.yaml")) + "\n# changed\n");

        assertThatThrownBy(() -> service.apply(
                "vaultwarden",
                new AppRecoveryModels.RecoveryApplyRequest(reviewed.planId(), false)))
                .isInstanceOf(InstallationException.class)
                .hasMessageContaining("changed after this recovery plan");
        verify(installedApps, never()).commitRecoveredApp(any(), any(), any());
    }

    @Test
    void rejectsAPlanWhenSavedManifestChangesAfterReview() throws Exception {
        Path appRoot = writeRuntime(true);
        ObservedService evidence = evidence("owned_managed", appRoot, "current-instance");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden"))
                .thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));
        AppRecoveryModels.RecoveryPlan reviewed = service.plan("vaultwarden");
        Files.writeString(appRoot.resolve("manifest.yaml"), Files.readString(appRoot.resolve("manifest.yaml")) + "\n# changed\n");

        assertThatThrownBy(() -> service.apply(
                "vaultwarden",
                new AppRecoveryModels.RecoveryApplyRequest(reviewed.planId(), false)))
                .isInstanceOf(InstallationException.class)
                .hasMessageContaining("changed after this recovery plan");
        verify(installedApps, never()).commitRecoveredApp(any(), any(), any());
    }

    @Test
    void restoresPreviousRuntimeWhenTransferredContainerFailsHealthVerification() throws Exception {
        Path appRoot = writeRuntime(true);
        markPreviousProject(appRoot);
        Files.createDirectories(appRoot.resolve("data"));
        ObservedService previous = evidence("foreign_autark_os", appRoot, "previous-instance");
        stubEvidence(previous);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden"))
                .thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        DockerComposeExecutor compose = mock(DockerComposeExecutor.class);
        ComposeRenderer renderer = mock(ComposeRenderer.class);
        AppRuntimeMetadataWriter metadataWriter = mock(AppRuntimeMetadataWriter.class);
        BackupService backups = mock(BackupService.class);
        TailscaleService tailscale = mock(TailscaleService.class);
        AppAccessChecker access = mock(AppAccessChecker.class);
        when(compose.down(any(), any())).thenReturn(success("stopped"));
        when(compose.up(any(), any())).thenReturn(success("started"));
        when(compose.containers(any(), any())).thenReturn(List.of(
                new RuntimeModels.DockerContainerStatus("vaultwarden", "vaultwarden", "exited", "unhealthy", "Exited", "8090:80")));

        AppRecoveryService transactional = completeService(compose, renderer, metadataWriter, backups, tailscale, access);
        AppRecoveryModels.RecoveryPlan plan = transactional.plan("vaultwarden");

        assertThatThrownBy(() -> transactional.apply(
                "vaultwarden",
                new AppRecoveryModels.RecoveryApplyRequest(plan.planId(), true)))
                .isInstanceOf(InstallationException.class)
                .hasMessageContaining("previous runtime arrangement");
        verify(compose).down(appRoot.resolve("compose.yaml"), "autarkos_current_vaultwarden");
        verify(compose).up(appRoot.resolve("compose.yaml"), plan.sourceComposeProject());
        verify(installedApps, never()).commitRecoveredApp(any(), any(), any());
    }

    private AppRecoveryService completeService(
            DockerComposeExecutor compose,
            ComposeRenderer renderer,
            AppRuntimeMetadataWriter metadataWriter,
            BackupService backups,
            TailscaleService tailscale,
            AppAccessChecker access) {
        return new AppRecoveryService(
                applicationInventory, observedServices, installedApps, catalog, new AppRuntimeMetadataReader(),
                dockerOwnership, activityLog, applicationState, compose, renderer, metadataWriter, backups,
                new RecoveryOperationCoordinator(), tailscale, access,
                com.autarkos.testsupport.DockerInventoryTestData.service(com.autarkos.testsupport.DockerInventoryTestData.empty()));
    }

    private RuntimeModels.DockerComposeResult success(String output) {
        return new RuntimeModels.DockerComposeResult(0, List.of(output));
    }

    private void markPreviousProject(Path appRoot) throws Exception {
        Path metadata = appRoot.resolve("autark-os-app.json");
        Files.writeString(metadata, Files.readString(metadata)
                .replace("autarkos_current_vaultwarden", "autarkos_previous_vaultwarden"));
    }

    private Path writeRuntime(boolean compose) throws Exception {
        Path appRoot = runtimeRoot.resolve("apps/vaultwarden");
        Files.createDirectories(appRoot);
        new CatalogPackageCopier().copyManifest(manifest, appRoot);
        Files.writeString(appRoot.resolve("autark-os-app.json"), """
                {
                  "appInstanceId": "appinst_vaultwarden",
                  "catalogAppId": "vaultwarden",
                  "instanceId": "current-instance",
                  "composeProject": "autarkos_current_vaultwarden",
                  "manifestVersion": "%s",
                  "createdAt": "2026-09-12T12:00:00Z"
                }
                """.formatted(manifest.version()));
        if (compose) {
            Files.writeString(appRoot.resolve("compose.yaml"), """
                    services:
                      %s:
                        image: %s
                        ports:
                          - "8090:80"
                        volumes:
                          - "%s:/data"
                    """.formatted(manifest.runtime().containerName(), manifest.runtime().image(), appRoot.resolve("data")));
        }
        return appRoot;
    }

    private ObservedService evidence(String ownership, Path appRoot, String ownerInstance) {
        return evidence(ownership, appRoot, ownerInstance, "running");
    }

    private ObservedService evidence(String ownership, Path appRoot, String ownerInstance, String runtimeState) {
        return evidence(ownership, appRoot, ownerInstance, runtimeState, appRoot.resolve("data"), manifest.runtime().image());
    }

    private ObservedService evidence(
            String ownership,
            Path appRoot,
            String ownerInstance,
            String runtimeState,
            Path liveDataPath,
            String liveImage) {
        Instant now = Instant.parse("2026-09-12T12:00:00Z");
        return new ObservedService(
                "docker:vaultwarden", "docker", "vaultwarden", "Vaultwarden", "http://localhost:8090",
                "LAN", "vaultwarden", "label", ownership, runtimeState,
                ownerInstance, now, now,
                "{\"dataPaths\":\"" + appRoot
                        + "\",\"appInstanceId\":\"appinst_vaultwarden\",\"ports\":\"0.0.0.0:8090->80/tcp\""
                        + ",\"image\":\"" + liveImage + "\",\"composeService\":\"" + manifest.runtime().containerName() + "\""
                        + ",\"liveMounts\":[{\"type\":\"bind\",\"source\":\"" + liveDataPath
                        + "\",\"target\":\"/data\",\"readOnly\":false}]}");
    }

    private void stubEvidence(ObservedService evidence) {
        when(observedServices.matchingCatalogServices("vaultwarden")).thenReturn(List.of(evidence));
        when(observedServices.observedServices()).thenReturn(List.of(evidence));
    }
}
