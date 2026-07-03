package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class AppReconciliationServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void reportsOwnedInstalledAppAsReadyFromContainerState() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));
        AppReconciliationService service = service(repository, List.of(
                new ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes (healthy)", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden")));

        assertThat(service.reconcile())
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.appId()).isEqualTo("vaultwarden");
                    assertThat(item.status()).isEqualTo("Ready");
                    assertThat(item.lifecycleEligible()).isTrue();
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
                    assertThat(item.lifecycleEligible()).isFalse();
                });
    }

    @Test
    void refusesLifecycleForLegacyOrForeignContainers() {
        InstalledAppRepository repository = repository();
        repository.save(installed("vaultwarden", "Ready"));
        repository.saveOwnershipMetadata(owned("vaultwarden", "ready"));

        assertThat(service(repository, List.of(
                new ManagedContainer("vaultwarden", "autark-os-vaultwarden", "Up 2 minutes", DockerResourceOwnership.LEGACY_UNSCOPED, "", ""))).reconcile())
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.status()).isEqualTo("Needs attention");
                    assertThat(item.ownership()).isEqualTo(DockerResourceOwnership.LEGACY_UNSCOPED);
                    assertThat(item.lifecycleEligible()).isFalse();
                });

        assertThat(service(repository, List.of(
                new ManagedContainer("vaultwarden", "autarkos_other_vaultwarden", "Up 2 minutes", DockerResourceOwnership.FOREIGN, "appinst_other", "autarkos_other_vaultwarden"))).reconcile())
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.status()).isEqualTo("Managed elsewhere");
                    assertThat(item.ownership()).isEqualTo(DockerResourceOwnership.FOREIGN);
                    assertThat(item.lifecycleEligible()).isFalse();
                });
    }

    @Test
    void reportsOwnedContainerWithoutDatabaseRowAsNeedsSetupWithoutAdoptingIt() {
        InstalledAppRepository repository = repository();

        assertThat(service(repository, List.of(
                new ManagedContainer("vaultwarden", "autarkos_homelab-box_vaultwarden", "Up 2 minutes", DockerResourceOwnership.OWNED, "appinst_vaultwarden", "autarkos_homelab-box_vaultwarden"))).reconcile())
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.status()).isEqualTo("Needs setup");
                    assertThat(item.lifecycleEligible()).isFalse();
                });
        assertThat(repository.findById("vaultwarden")).isEmpty();
    }

    private AppReconciliationService service(InstalledAppRepository repository, List<ManagedContainer> containers) {
        return new AppReconciliationService(
                repository,
                () -> containers,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()));
    }

    private InstalledAppRepository repository() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new InstalledAppRepository(new RuntimeLayout(properties));
    }

    private InstalledApp installed(String appId, String status) {
        return new InstalledApp(appId, appId, status, runtimeRoot.resolve("apps").resolve(appId).toString(), "autarkos_homelab-box_" + appId, "http://localhost:8090", Instant.parse("2026-06-20T12:00:00Z"));
    }

    private InstalledAppOwnershipMetadata owned(String appId, String state) {
        return new InstalledAppOwnershipMetadata(
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
