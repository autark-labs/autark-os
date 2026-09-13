package com.autarkos.apps.recovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.apps.ApplicationInventoryService;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppRuntimeMetadataReader;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.model.ApplicationManifest;
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
        manifest = catalog.findById("vaultwarden").orElseThrow();
        service = new AppRecoveryService(
                applicationInventory,
                observedServices,
                installedApps,
                catalog,
                new AppRuntimeMetadataReader(),
                dockerOwnership,
                activityLog,
                applicationState);
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
        var result = service.apply("vaultwarden", new AppRecoveryModels.RecoveryApplyRequest(plan.confirmationText()));

        assertThat(plan.reason()).isEqualTo("current_instance_registration_lost");
        assertThat(plan.applicable()).isTrue();
        assertThat(result.ok()).isTrue();
        ArgumentCaptor<InstalledApp> app = ArgumentCaptor.forClass(InstalledApp.class);
        verify(installedApps).save(app.capture());
        assertThat(app.getValue().runtimePath()).isEqualTo(appRoot.toString());
        assertThat(app.getValue().composeProject()).isEqualTo("autarkos_current_vaultwarden");
        verify(installedApps, never()).saveSettings(any(), any());
    }

    @Test
    void previousInstancePlanIsBlockedAndApplyWritesNoManagedRecord() throws Exception {
        Path appRoot = writeRuntime(true);
        ObservedService evidence = evidence("foreign_autark_os", appRoot, "previous-instance");
        stubEvidence(evidence);
        when(installedApps.findAppById("vaultwarden")).thenReturn(Optional.empty());
        when(installedApps.settingsFor("vaultwarden")).thenReturn(Optional.of(InstallModels.InstallSettings.defaults("http://localhost:8090")));

        AppRecoveryModels.RecoveryPlan plan = service.plan("vaultwarden");
        var result = service.apply("vaultwarden", new AppRecoveryModels.RecoveryApplyRequest(plan.confirmationText()));

        assertThat(plan.reason()).isEqualTo("previous_instance");
        assertThat(plan.applicable()).isFalse();
        assertThat(result.ok()).isFalse();
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
        var result = service.apply("vaultwarden", new AppRecoveryModels.RecoveryApplyRequest(plan.confirmationText()));

        assertThat(plan.applicable()).isFalse();
        assertThat(plan.checks()).filteredOn(check -> check.id().equals("compose"))
                .singleElement().satisfies(check -> assertThat(check.message()).contains("missing"));
        assertThat(result.ok()).isFalse();
        verify(installedApps, never()).save(any(InstalledApp.class));
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

    private Path writeRuntime(boolean compose) throws Exception {
        Path appRoot = runtimeRoot.resolve("apps/vaultwarden");
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("autark-os-app.json"), """
                {
                  "appInstanceId": "appinst_vaultwarden",
                  "catalogAppId": "vaultwarden",
                  "instanceId": "current-instance",
                  "composeProject": "autarkos_current_vaultwarden",
                  "manifestVersion": "1",
                  "createdAt": "2026-09-12T12:00:00Z"
                }
                """);
        if (compose) {
            Files.writeString(appRoot.resolve("compose.yaml"), """
                    services:
                      %s:
                        image: %s
                        ports:
                          - "8090:80"
                        volumes:
                          - "/var/lib/autark-os/apps/vaultwarden/data:/data"
                    """.formatted(manifest.runtime().containerName(), manifest.runtime().image()));
        }
        return appRoot;
    }

    private ObservedService evidence(String ownership, Path appRoot, String ownerInstance) {
        Instant now = Instant.parse("2026-09-12T12:00:00Z");
        return new ObservedService(
                "docker:vaultwarden", "docker", "vaultwarden", "Vaultwarden", "http://localhost:8090",
                "Applications", "LAN", "vaultwarden", "label", ownership, "observed", "running", false,
                ownerInstance, now, now, null, null,
                "{\"dataPaths\":\"" + appRoot + "\",\"appInstanceId\":\"appinst_vaultwarden\",\"ports\":\"0.0.0.0:8090->80/tcp\"}");
    }

    private void stubEvidence(ObservedService evidence) {
        when(observedServices.matchingCatalogServices("vaultwarden")).thenReturn(List.of(evidence));
        when(observedServices.observedServices()).thenReturn(List.of(evidence));
    }
}
