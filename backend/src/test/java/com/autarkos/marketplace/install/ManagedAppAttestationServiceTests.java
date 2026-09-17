package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.AutarkOsIdentity;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.testsupport.ManagedAppTestContract;

class ManagedAppAttestationServiceTests {

    @TempDir
    Path runtimeRoot;

    private RuntimeLayout runtimeLayout;
    private InstalledAppRepository repository;
    private ManagedAppAttestationService service;
    private AutarkOsIdentity identity;
    private InstalledApp app;

    @BeforeEach
    void setUp() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        runtimeLayout = new RuntimeLayout(properties);
        repository = JpaTestRepositories.installedAppRepository(runtimeLayout);
        identity = new AutarkOsIdentity("pos_current", "current", runtimeRoot.toString(), "runtime-hash",
                Instant.parse("2026-09-15T00:00:00Z"), 1);
        app = new InstalledApp("vaultwarden", "Vaultwarden", "Stopped",
                runtimeLayout.appRoot("vaultwarden").toString(), "autarkos_current_vaultwarden",
                "http://localhost:8090", Instant.parse("2026-09-15T00:00:00Z"));
        repository.save(app);
        repository.saveOwnershipMetadata(ownership(identity.instanceId(), app.runtimePath()));
        ManagedAppTestContract.writeAll(repository, runtimeLayout, identity);
        service = ManagedAppTestContract.service(repository, runtimeLayout, identity);
    }

    @Test
    void completeDurableContractIsManagedWithoutLiveContainerEvidence() {
        ManagedAppAttestationService.Result attestation = service.attest("vaultwarden");

        assertThat(attestation.managed()).isTrue();
        assertThat(attestation.app().status()).isEqualTo("Stopped");
        assertThat(attestation.ownership().appInstanceId()).isEqualTo("appinst_vaultwarden");
        assertThat(service.managedApps()).containsExactly(app);
    }

    @Test
    void missingComposeOrManifestCannotAuthorizeManagedMutations() throws Exception {
        Files.delete(runtimeLayout.appRoot("vaultwarden").resolve("compose.yaml"));

        assertThat(service.attest("vaultwarden").reasonCode()).isEqualTo("compose_missing");
        assertThatThrownBy(() -> service.requireManaged("vaultwarden", "start"))
                .isInstanceOf(InstallationException.class)
                .hasMessageContaining("not fully managed")
                .hasMessageContaining("Compose configuration is missing");

        Files.writeString(runtimeLayout.appRoot("vaultwarden").resolve("compose.yaml"), "services: {}\n");
        Files.delete(runtimeLayout.appRoot("vaultwarden").resolve("manifest.yaml"));
        assertThat(service.attest("vaultwarden").reasonCode()).isEqualTo("release_manifest_missing");
    }

    @Test
    void ownershipAndRuntimeIdentityMustAgreeWithTheCurrentInstallation() throws Exception {
        repository.saveOwnershipMetadata(ownership("pos_previous", app.runtimePath()));
        assertThat(service.attest("vaultwarden").reasonCode()).isEqualTo("owner_instance_mismatch");

        repository.saveOwnershipMetadata(ownership(identity.instanceId(), app.runtimePath()));
        Files.writeString(runtimeLayout.appRoot("vaultwarden").resolve(AppRuntimeMetadataWriter.METADATA_FILE), """
                {"appInstanceId":"other","catalogAppId":"vaultwarden","instanceId":"pos_current","composeProject":"autarkos_current_vaultwarden","manifestVersion":"test","createdAt":"2026-09-15T00:00:00Z"}
                """);
        assertThat(service.attest("vaultwarden").reasonCode()).isEqualTo("runtime_identity_mismatch");
    }

    @Test
    void nonCanonicalRuntimePathCannotRemainManaged() {
        InstalledApp moved = new InstalledApp(app.appId(), app.appName(), app.status(),
                runtimeRoot.resolve("old-apps/vaultwarden").toString(), app.composeProject(), app.accessUrl(), app.installedAt());
        repository.save(moved);

        assertThat(service.attest("vaultwarden").reasonCode()).isEqualTo("runtime_path_mismatch");
        assertThat(service.managedApps()).isEmpty();
    }

    private RuntimeModels.InstalledAppOwnershipMetadata ownership(String ownerInstanceId, String runtimePath) {
        return new RuntimeModels.InstalledAppOwnershipMetadata(
                "vaultwarden", "appinst_vaultwarden", "vaultwarden", ownerInstanceId, runtimePath,
                "ready", "owned", Instant.parse("2026-09-15T00:00:00Z"), Instant.parse("2026-09-15T00:00:00Z"));
    }
}
