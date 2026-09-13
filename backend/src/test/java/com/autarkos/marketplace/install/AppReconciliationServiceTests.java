package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class AppReconciliationServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void reportsOwnedInstalledAppAsReadyFromContainerState() throws Exception {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        java.nio.file.Files.createDirectories(runtimeRoot.resolve("apps/vaultwarden"));
        java.nio.file.Files.writeString(runtimeRoot.resolve("apps/vaultwarden/compose.yaml"), "services: {}\n");
        AppReconciliationService service = service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes (healthy)", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")));

        assertThat(service.reconcile())
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.appId()).isEqualTo("vaultwarden");
                    assertThat(item.status()).isEqualTo("Ready");
                });
    }

    @Test
    void reportsInstalledAppMissingWhenNoOwnedContainersExist() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));

        assertThat(service(repository, List.of()).reconcile())
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.status()).isEqualTo("Missing");
                });
    }

    @Test
    void refusesLifecycleForLegacyOrForeignContainers() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));

        assertThat(service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autark-os-vaultwarden", "Up 2 minutes", DockerResourceOwnership.LEGACY_UNSCOPED, "", ""))).reconcile())
                .isEmpty();

        assertThat(service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_other_vaultwarden", "Up 2 minutes", DockerResourceOwnership.FOREIGN, "appinst_other", "autarkos_other_vaultwarden"))).reconcile())
                .isEmpty();
    }

    @Test
    void storedRecoveryStateDoesNotOverrideForeignDockerOwnership() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Needs attention"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "recovery_required"));

        assertThat(service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_old_vaultwarden", "Exited (0) 2 hours ago", DockerResourceOwnership.FOREIGN, "appinst_old", "autarkos_old_vaultwarden"))).reconcile())
                .isEmpty();
    }

    @Test
    void reportsOwnedContainerWithoutDatabaseRowAsNeedsSetupWithoutAdoptingIt() {
        InstalledAppRepository repository = repository();

        assertThat(service(repository, List.of(
                new RuntimeModels.ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden"))).reconcile())
                .isEmpty();
        assertThat(repository.findAppById("vaultwarden")).isEmpty();
    }

    private AppReconciliationService service(InstalledAppRepository repository, List<RuntimeModels.ManagedContainer> containers) {
        return new AppReconciliationService(
                repository,
                () -> containers);
    }

    private InstalledAppRepository repository() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return JpaTestRepositories.installedAppRepository(new RuntimeLayout(properties));
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
}
