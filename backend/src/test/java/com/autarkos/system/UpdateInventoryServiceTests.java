package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.host.DockerInventoryService;
import com.autarkos.host.DockerInventorySnapshot;
import com.autarkos.host.HostModels;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.DockerResourceOwnership;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class UpdateInventoryServiceTests {

    private static final Instant NOW = Instant.parse("2026-09-12T12:00:00Z");

    @TempDir
    Path runtimeRoot;

    private RuntimeLayout runtimeLayout;
    private ManagedAppAttestationService attestations;
    private InstanceIdentityService identities;
    private DockerInventoryService docker;
    private AutarkOsIdentity identity;

    @BeforeEach
    void setUp() throws Exception {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        runtimeLayout = new RuntimeLayout(properties);
        attestations = mock(ManagedAppAttestationService.class);
        identities = mock(InstanceIdentityService.class);
        docker = mock(DockerInventoryService.class);
        identity = new AutarkOsIdentity(
                "pos_current", "current", runtimeRoot.toString(), "sha256:runtime", NOW, 1);
        Files.createDirectories(runtimeLayout.configRoot());
        Files.writeString(runtimeLayout.identityPath(), "stable installation identity\n");
        when(identities.current()).thenReturn(identity);
    }

    @Test
    void normalUpdateRetainsCompleteAttestationsAndContainerOwnership() throws Exception {
        var vaultwarden = attestation("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden");
        var homepage = attestation("homepage", "appinst_home", "autarkos_current_homepage");
        when(attestations.managedAttestations())
                .thenReturn(List.of(vaultwarden, homepage))
                .thenReturn(List.of(homepage, vaultwarden));
        DockerInventorySnapshot inventory = inventory(
                ownedContainer("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden"),
                ownedContainer("homepage", "appinst_home", "autarkos_current_homepage"));
        when(docker.requireFresh()).thenReturn(inventory, inventory);
        UpdateInventoryService service = service();

        var snapshot = service.capture();
        var verification = service.verify(snapshot);

        assertThat(snapshot.schemaVersion()).isEqualTo(2);
        assertThat(snapshot.managedApps()).extracting(app -> app.catalogAppId())
                .containsExactly("homepage", "vaultwarden");
        assertThat(snapshot.managedApps()).allSatisfy(app -> {
            assertThat(app.savedManifestSha256()).startsWith("sha256:");
            assertThat(app.composeSha256()).startsWith("sha256:");
            assertThat(app.containers()).hasSize(1);
        });
        assertThat(verification.safe()).isTrue();
        assertThat(verification.summary()).contains("retained their complete identity");
        assertThat(verification.violations()).isEmpty();
    }

    @Test
    void firstUpgradeFromLegacyInventoryEstablishesTheCompleteBaseline() throws Exception {
        var current = attestation("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden");
        when(attestations.managedAttestations()).thenReturn(List.of(current));
        when(docker.requireFresh()).thenReturn(
                inventory(ownedContainer("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden")));
        var legacy = legacySnapshot("appinst_vault");

        var verification = service().verify(legacy);

        assertThat(verification.safe()).isTrue();
        assertThat(verification.schemaVersion()).isEqualTo(2);
        assertThat(verification.after().identityFileSha256()).startsWith("sha256:");
        assertThat(verification.after().managedApps()).singleElement().satisfies(app -> {
            assertThat(app.registrationInstalledAt()).isEqualTo(NOW);
            assertThat(app.savedManifestSha256()).startsWith("sha256:");
            assertThat(app.containers()).hasSize(1);
        });
    }

    @Test
    void legacyInventoryStillRejectsAChangedDurableIdentity() throws Exception {
        var current = attestation("vaultwarden", "appinst_replaced", "autarkos_current_vaultwarden");
        when(attestations.managedAttestations()).thenReturn(List.of(current));
        when(docker.requireFresh()).thenReturn(
                inventory(ownedContainer("vaultwarden", "appinst_replaced", "autarkos_current_vaultwarden")));

        var verification = service().verify(legacySnapshot("appinst_vault"));

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).extracting(UpdateInventoryModels.Violation::code)
                .containsExactly("app_instance_changed");
    }

    @Test
    void managedToRecoveryRequiredIsAnUpdateFailure() throws Exception {
        var before = attestation("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden");
        when(attestations.managedAttestations()).thenReturn(List.of(before)).thenReturn(List.of());
        when(attestations.attest("vaultwarden")).thenReturn(new ManagedAppAttestationService.Result(
                false,
                "registration_missing",
                "The managed app registration is missing.",
                null,
                null,
                null));
        DockerInventorySnapshot inventory = inventory(
                ownedContainer("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden"));
        when(docker.requireFresh()).thenReturn(inventory, inventory);
        UpdateInventoryService service = service();

        var verification = service.verify(service.capture());

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).singleElement().satisfies(violation -> {
            assertThat(violation.code()).isEqualTo("registration_missing");
            assertThat(violation.expected()).isEqualTo("managed");
            assertThat(violation.actual()).isEqualTo("registration_missing");
        });
    }

    @Test
    void missingOwnershipRecordIsReportedExactly() throws Exception {
        var before = attestation("homepage", "appinst_home", "autarkos_current_homepage");
        when(attestations.managedAttestations()).thenReturn(List.of(before)).thenReturn(List.of());
        when(attestations.attest("homepage")).thenReturn(new ManagedAppAttestationService.Result(
                false,
                "ownership_missing",
                "The app ownership record is missing.",
                before.app(),
                null,
                null));
        DockerInventorySnapshot inventory = inventory(
                ownedContainer("homepage", "appinst_home", "autarkos_current_homepage"));
        when(docker.requireFresh()).thenReturn(inventory, inventory);

        var verification = service().verify(service().capture());

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).extracting(UpdateInventoryModels.Violation::code)
                .containsExactly("ownership_missing");
    }

    @Test
    void savedManifestOrComposeChangesFailContinuity() throws Exception {
        var app = attestation("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden");
        when(attestations.managedAttestations()).thenReturn(List.of(app));
        DockerInventorySnapshot inventory = inventory(
                ownedContainer("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden"));
        when(docker.requireFresh()).thenReturn(inventory);
        UpdateInventoryService service = service();
        var before = service.capture();

        Files.writeString(runtimeLayout.appRoot("vaultwarden").resolve("manifest.yaml"), "id: vaultwarden\n# changed\n");
        Files.writeString(runtimeLayout.appRoot("vaultwarden").resolve("compose.yaml"), "services:\n  changed: {}\n");
        var verification = service.verify(before);

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).extracting(UpdateInventoryModels.Violation::code)
                .containsExactly("saved_manifest_changed", "compose_configuration_changed");
    }

    @Test
    void changedContainerOwnershipFailsContinuity() throws Exception {
        var app = attestation("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden");
        when(attestations.managedAttestations()).thenReturn(List.of(app));
        when(docker.requireFresh()).thenReturn(
                inventory(ownedContainer("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden")),
                inventory(foreignContainer("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden")));
        UpdateInventoryService service = service();

        var verification = service.verify(service.capture());

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).extracting(UpdateInventoryModels.Violation::code)
                .containsExactly("container_ownership_changed");
        assertThat(verification.violations().getFirst().actual()).contains("ownershipState=foreign");
    }

    @Test
    void changedInstallationIdentityFileFailsContinuity() throws Exception {
        var app = attestation("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden");
        when(attestations.managedAttestations()).thenReturn(List.of(app));
        DockerInventorySnapshot inventory = inventory(
                ownedContainer("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden"));
        when(docker.requireFresh()).thenReturn(inventory);
        UpdateInventoryService service = service();
        var before = service.capture();

        Files.writeString(runtimeLayout.identityPath(), "replacement identity\n");
        var verification = service.verify(before);

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).extracting(UpdateInventoryModels.Violation::code)
                .containsExactly("identity_file_changed");
    }

    @Test
    void captureRejectsAmbiguousOrForeignManagedContainers() throws Exception {
        var app = attestation("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden");
        when(attestations.managedAttestations()).thenReturn(List.of(app));
        when(docker.requireFresh()).thenReturn(
                inventory(foreignContainer("vaultwarden", "appinst_vault", "autarkos_current_vaultwarden")));

        assertThatThrownBy(() -> service().capture())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("invalid attestation");
    }

    private UpdateInventoryService service() {
        return new UpdateInventoryService(attestations, identities, docker, runtimeLayout);
    }

    private UpdateInventoryModels.Snapshot legacySnapshot(String appInstanceId) {
        return new UpdateInventoryModels.Snapshot(
                1,
                NOW,
                identity.instanceId(),
                identity.runtimeRoot(),
                identity.runtimeRootHash(),
                null,
                List.of(new UpdateInventoryModels.ManagedApp(
                        "vaultwarden",
                        appInstanceId,
                        identity.instanceId(),
                        runtimeLayout.appRoot("vaultwarden").toString(),
                        "autarkos_current_vaultwarden",
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null)));
    }

    private ManagedAppAttestationService.Result attestation(
            String appId,
            String appInstanceId,
            String composeProject) throws Exception {
        Path appRoot = runtimeLayout.appRoot(appId);
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("manifest.yaml"), "id: " + appId + "\nmetadata:\n  version: 1.0.0\n");
        Files.writeString(appRoot.resolve("compose.yaml"), "services: {}\n");
        InstalledApp app = new InstalledApp(
                appId,
                appId,
                "Stopped",
                appRoot.toString(),
                composeProject,
                "http://localhost",
                NOW);
        RuntimeModels.InstalledAppOwnershipMetadata ownership = new RuntimeModels.InstalledAppOwnershipMetadata(
                appId,
                appInstanceId,
                appId,
                identity.instanceId(),
                appRoot.toString(),
                "installed",
                "owned",
                NOW,
                NOW);
        RuntimeModels.AppRuntimeMetadata metadata = new RuntimeModels.AppRuntimeMetadata(
                appInstanceId,
                appId,
                identity.instanceId(),
                composeProject,
                "1.0.0",
                NOW,
                List.of());
        return new ManagedAppAttestationService.Result(
                true,
                "managed",
                "Autark-OS has the complete managed app contract.",
                app,
                ownership,
                metadata);
    }

    private DockerInventorySnapshot inventory(DockerInventorySnapshot.Container... containers) {
        return DockerInventorySnapshot.available(NOW, identity.instanceId(), List.of(containers));
    }

    private DockerInventorySnapshot.Container ownedContainer(
            String appId,
            String appInstanceId,
            String composeProject) {
        return container(appId, appInstanceId, composeProject, identity.instanceId(),
                identity.runtimeRootHash(), DockerResourceOwnership.OWNED);
    }

    private DockerInventorySnapshot.Container foreignContainer(
            String appId,
            String appInstanceId,
            String composeProject) {
        return container(appId, appInstanceId, composeProject, "pos_foreign",
                "sha256:foreign", DockerResourceOwnership.FOREIGN);
    }

    private DockerInventorySnapshot.Container container(
            String appId,
            String appInstanceId,
            String composeProject,
            String ownerInstanceId,
            String runtimeRootHash,
            DockerResourceOwnership ownership) {
        Map<String, String> labels = Map.of(
                DockerOwnershipService.MANAGED, "true",
                DockerOwnershipService.APP_ID, appId,
                DockerOwnershipService.APP_INSTANCE_ID, appInstanceId,
                DockerOwnershipService.INSTANCE_ID, ownerInstanceId,
                DockerOwnershipService.RUNTIME_ROOT_HASH, runtimeRootHash,
                DockerOwnershipService.COMPOSE_PROJECT, composeProject);
        return new DockerInventorySnapshot.Container(
                new HostModels.HostDockerContainer(appId, appId + ":1.0.0", "Up", labels, ""),
                new RuntimeModels.DockerResourceClassification(ownership, appId, appInstanceId, composeProject));
    }
}
