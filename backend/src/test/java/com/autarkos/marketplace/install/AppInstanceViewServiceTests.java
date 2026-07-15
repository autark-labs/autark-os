package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.backups.BackupRepository;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.ReliabilityModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.tailscale.TailscaleServeConfig;
import com.autarkos.network.tailscale.TailscaleServeMapping;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.testsupport.RestorePointTestRecords;

class AppInstanceViewServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void readyOwnedAppViewIncludesOpenAndRestartActions() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings("http://localhost:8090", "https://autark-os.example.ts.net:12890", true, java.util.Map.of(), new InstallModels.BackupPolicy(false, "daily", 7)));
        AppInstanceViewService service = service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes (healthy)", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")));

        AppInstanceView view = service.list().getFirst();

        assertThat(view.appInstanceId()).isEqualTo("appinst_vaultwarden");
        assertThat(view.catalogAppId()).isEqualTo("vaultwarden");
        assertThat(view.name()).isEqualTo("Vaultwarden");
        assertThat(view.category()).isEqualTo("Security");
        assertThat(view.userStatus()).isEqualTo("Ready");
        assertThat(view.managementState()).isEqualTo("managed");
        assertThat(view.readinessState()).isEqualTo("ready");
        assertThat(view.attentionState()).isEqualTo("none");
        assertThat(view.ownershipState()).isEqualTo("owned");
        assertThat(view.accessState()).isEqualTo("private_ready");
        assertThat(view.localUrl()).isEqualTo("http://localhost:8090");
        assertThat(view.privateUrl()).isEqualTo("https://autark-os.example.ts.net:12890");
        assertThat(view.remediation().state()).isEqualTo("watching");
        assertThat(view.remediation().label()).isEqualTo("Autark-OS is watching");
        assertThat(view.actions()).extracting(action -> action.id()).contains("open-vaultwarden", "restart-vaultwarden");
        assertThat(view.actions())
                .filteredOn(action -> action.id().equals("open-vaultwarden"))
                .singleElement()
                .satisfies(action -> assertThat(action.href()).contains("https://autark-os.example.ts.net:12890"));
        assertThat(view.issues()).isEmpty();
    }

    @Test
    void storedPrivateUrlWithoutLiveServeMappingIsNotExposedAsAnOpenLink() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings("http://localhost:8090", "https://autark-os.example.ts.net:14743", true, java.util.Map.of(), new InstallModels.BackupPolicy(false, "daily", 7)));
        TailscaleService noMappings = new TailscaleService() {
            @Override
            public TailscaleStatus status() {
                return new TailscaleStatus(true, true, "connected", "Connected", "autark-os", "autark-os.example.ts.net", List.of("100.64.0.1"), "example.ts.net", "owner");
            }

            @Override
            public TailscaleServeConfig serveConfig() {
                return new TailscaleServeConfig(true, "available", "No live mappings", List.of(), List.of(), Instant.now());
            }
        };
        AppInstanceViewService service = service(repository, backupRepository(), List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes (healthy)", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")), noMappings);

        AppInstanceView view = service.list().getFirst();

        assertThat(view.accessState()).isEqualTo("private_needs_setup");
        assertThat(view.privateUrl()).isNull();
        assertThat(view.issues())
                .filteredOn(issue -> "access".equals(issue.scope()))
                .singleElement()
                .satisfies(issue -> {
                    assertThat(issue.reasonCode()).isEqualTo("private_access_missing");
                    assertThat(issue.primaryAction()).isPresent();
                });
        assertThat(view.actions())
                .filteredOn(action -> action.id().equals("open-vaultwarden"))
                .singleElement()
                .satisfies(action -> assertThat(action.href()).contains("http://localhost:8090"));
    }

    @Test
    void missingOwnedAppViewIncludesRepairIssueAndAction() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        AppInstanceViewService service = service(repository, List.of());

        AppInstanceView view = service.list().getFirst();

        assertThat(view.userStatus()).isEqualTo("Missing");
        assertThat(view.runtimeState()).isEqualTo("missing");
        assertThat(view.managementState()).isEqualTo("managed");
        assertThat(view.readinessState()).isEqualTo("unreachable");
        assertThat(view.attentionState()).isEqualTo("blocked");
        assertThat(view.issues()).singleElement().satisfies(issue -> {
            assertThat(issue.reasonCode()).isEqualTo("app_missing_container");
            assertThat(issue.severity()).isEqualTo("critical");
            assertThat(issue.primaryAction()).isPresent();
        });
        assertThat(view.actions()).extracting(action -> action.id()).contains("repair-vaultwarden");
    }

    @Test
    void foreignDiscoveredAppsAreExcludedFromUserFacingList() {
        InstalledAppRepository repository = repository();
        AppInstanceViewService service = service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_other_vaultwarden", "Up 2 minutes", DockerResourceOwnership.FOREIGN, "appinst_other", "autarkos_other_vaultwarden")));

        assertThat(service.list()).isEmpty();
    }

    @Test
    void ownedContainerWithoutDatabaseRowIsExcludedFromUserFacingList() {
        InstalledAppRepository repository = repository();
        AppInstanceViewService service = service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")));

        assertThat(service.list()).isEmpty();
    }

    @Test
    void adoptedLegacyContainerAppearsAsManagedApp() {
        InstalledAppRepository repository = repository();
        repository.save(installed("homepage", "Ready"));
        repository.saveOwnershipMetadata(owned("homepage", "adopted"));
        repository.saveSettings("homepage", new InstallModels.InstallSettings("http://localhost:3005", null, false, java.util.Map.of(), new InstallModels.BackupPolicy(false, "daily", 7)));
        AppInstanceViewService service = service(repository, List.of(
                new RuntimeModels.ManagedContainer("homepage", "autark-os-homepage", "Up 2 minutes (healthy)", DockerResourceOwnership.LEGACY_UNSCOPED, "", "")));

        assertThat(service.list())
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.catalogAppId()).isEqualTo("homepage");
                    assertThat(view.name()).isEqualTo("Homepage");
                    assertThat(view.userStatus()).isEqualTo("Ready");
                    assertThat(view.ownershipState()).isEqualTo("owned");
                    assertThat(view.localUrl()).isEqualTo("http://localhost:3005");
                });
    }

    @Test
    void stoppedManagedAppViewIsPausedReadiness() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        AppInstanceViewService service = service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Exited 1 minute ago", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")));

        AppInstanceView view = service.list().getFirst();

        assertThat(view.userStatus()).isEqualTo("Stopped");
        assertThat(view.readinessState()).isEqualTo("paused");
        assertThat(view.attentionState()).isEqualTo("none");
    }

    @Test
    void backupEnabledWithoutRestorePointIsNotProtected() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings("http://localhost:8090", null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        AppInstanceViewService service = service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")));

        assertThat(service.list().getFirst().backupState()).isEqualTo("backup_enabled_no_restore_point");
    }

    @Test
    void completedRestorePointMarksAppProtected() {
        InstalledAppRepository repository = repository();
        BackupRepository backupRepository = backupRepository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings("http://localhost:8090", null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        RestorePointTestRecords.record(backupRepository, "vaultwarden", "Vaultwarden", "app", "manual", "vaultwarden", "/backups/vaultwarden.zip", "completed", 128, "Backup completed.");
        AppInstanceViewService service = service(repository, backupRepository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")));

        assertThat(service.list().getFirst().backupState()).isEqualTo("protected_by_restore_point");
    }

    @Test
    void completedRestorePointKeepsAppProtectedEvenWhenLatestBackupFailed() {
        InstalledAppRepository repository = repository();
        BackupRepository backupRepository = backupRepository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings("http://localhost:8090", null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        RestorePointTestRecords.record(backupRepository, "vaultwarden", "Vaultwarden", "app", "manual", "vaultwarden", "/backups/vaultwarden.zip", "completed", 128, "Backup completed.");
        RestorePointTestRecords.record(backupRepository, "vaultwarden", "Vaultwarden", "app", "manual", "vaultwarden", "", "failed", 0, "Backup failed.");
        AppInstanceViewService service = service(repository, backupRepository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")));

        assertThat(service.list().getFirst().backupState()).isEqualTo("protected_by_restore_point");
    }

    @Test
    void failedLatestBackupMarksAppFailed() {
        InstalledAppRepository repository = repository();
        BackupRepository backupRepository = backupRepository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        repository.saveSettings("vaultwarden", new InstallModels.InstallSettings("http://localhost:8090", null, false, java.util.Map.of(), new InstallModels.BackupPolicy(true, "daily", 7)));
        RestorePointTestRecords.record(backupRepository, "vaultwarden", "Vaultwarden", "app", "manual", "vaultwarden", "", "failed", 0, "Backup failed.");
        AppInstanceViewService service = service(repository, backupRepository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")));

        assertThat(service.list().getFirst().backupState()).isEqualTo("backup_failed");
    }

    @Test
    void failedRepairWithoutRestorePointRequiresRepairReview() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        repository.saveSettings("vaultwarden", settingsWithRepairStatus("failed", true, new InstallModels.BackupPolicy(true, "daily", 7)));
        AppInstanceViewService service = service(repository, List.of());

        AppInstanceView view = service.list().getFirst();

        assertThat(view.userStatus()).isEqualTo("Missing");
        assertThat(view.remediation().state()).isEqualTo("repair_failed");
        assertThat(view.remediation().nextActionLabel()).isEqualTo("Review repair");
        assertThat(view.remediation().summary()).doesNotContain("restore point");
    }

    @Test
    void failedRepairWithRestorePointRecommendsRestore() {
        InstalledAppRepository repository = repository();
        BackupRepository backupRepository = backupRepository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        repository.saveSettings("vaultwarden", settingsWithRepairStatus("failed", true, new InstallModels.BackupPolicy(true, "daily", 7)));
        RestorePointTestRecords.record(backupRepository, "vaultwarden", "Vaultwarden", "app", "manual", "vaultwarden", "/backups/vaultwarden.zip", "completed", 128, "Backup completed.");
        AppInstanceViewService service = service(repository, backupRepository, List.of());

        ReliabilityModels.AppRemediationView remediation = service.list().getFirst().remediation();

        assertThat(remediation.state()).isEqualTo("restore_recommended");
        assertThat(remediation.nextActionLabel()).isEqualTo("Review restore");
        assertThat(remediation.summary()).contains("restore point");
    }

    private AppInstanceViewService service(InstalledAppRepository repository, List<RuntimeModels.ManagedContainer> containers) {
        return service(repository, backupRepository(), containers);
    }

    private AppInstanceViewService service(InstalledAppRepository repository, BackupRepository backupRepository, List<RuntimeModels.ManagedContainer> containers) {
        return service(repository, backupRepository, containers, tailscaleService());
    }

    private AppInstanceViewService service(InstalledAppRepository repository, BackupRepository backupRepository, List<RuntimeModels.ManagedContainer> containers, TailscaleService tailscaleService) {
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        return new AppInstanceViewService(
                repository,
                new AppReconciliationService(repository, () -> containers, catalogService),
                catalogService,
                backupRepository,
                tailscaleService);
    }

    private TailscaleService tailscaleService() {
        return new TailscaleService() {
            @Override
            public TailscaleStatus status() {
                return new TailscaleStatus(true, true, "connected", "Connected", "autark-os", "autark-os.example.ts.net", List.of("100.64.0.1"), "example.ts.net", "owner");
            }

            @Override
            public TailscaleServeConfig serveConfig() {
                return new TailscaleServeConfig(
                        true,
                        "available",
                        "test config",
                        List.of(new TailscaleServeMapping(null, "https://autark-os.example.ts.net:12890/", 12890, "http://127.0.0.1:8090", 8090)),
                        List.of(),
                        Instant.now());
            }
        };
    }

    private InstalledAppRepository repository() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return JpaTestRepositories.installedAppRepository(new RuntimeLayout(properties));
    }

    private BackupRepository backupRepository() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return JpaTestRepositories.backupRepository(new RuntimeLayout(properties));
    }

    private InstalledApp installed(String appId, String status) {
        return new InstalledApp(appId, appId, status, runtimeRoot.resolve("apps").resolve(appId).toString(), "autarkos_homelab-box_" + appId, "http://localhost:8090", Instant.parse("2026-06-20T12:00:00Z"));
    }

    private RuntimeModels.InstalledAppOwnershipMetadata owned(String appId, String state) {
        return new RuntimeModels.InstalledAppOwnershipMetadata(
                appId,
                "appinst_" + appId,
                appId,
                "pos_abcdef1234567890",
                runtimeRoot.resolve("apps").resolve(appId).toString(),
                state,
                "owned",
                Instant.parse("2026-06-20T12:00:00Z"),
                Instant.parse("2026-06-20T12:00:00Z"));
    }

    private InstallModels.InstallSettings settingsWithRepairStatus(String lastRepairStatus, boolean autoRepairEnabled, InstallModels.BackupPolicy backupPolicy) {
        return new InstallModels.InstallSettings(
                "http://localhost:8090",
                null,
                false,
                java.util.Map.of(),
                backupPolicy,
                "local",
                "optional",
                null,
                "http",
                null,
                null,
                Instant.parse("2026-06-20T12:05:00Z"),
                lastRepairStatus,
                autoRepairEnabled);
    }
}
