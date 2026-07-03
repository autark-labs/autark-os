package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.autarkos.system.AutarkOsIdentity;

class DockerOwnershipServiceTests {

    private final AutarkOsIdentity identity = new AutarkOsIdentity(
            "pos_abcdef1234567890",
            "homelab-box",
            "/var/lib/autark-os",
            "sha256:runtimehash",
            Instant.parse("2026-06-20T12:00:00Z"),
            1);

    @Test
    void buildsInstanceScopedComposeProjectNames() {
        DockerOwnershipService service = new DockerOwnershipService(() -> identity, () -> "0.2.0", false);

        assertThat(service.composeProject("vaultwarden")).isEqualTo("autarkos_homelab-box_vaultwarden");
    }

    @Test
    void buildsDevComposeProjectNamesWithShortInstanceId() {
        DockerOwnershipService service = new DockerOwnershipService(() -> identity, () -> "0.2.0", true);

        assertThat(service.composeProject("vaultwarden")).isEqualTo("autarkos_dev_abcdef12_vaultwarden");
    }

    @Test
    void createsRequiredDockerLabels() {
        DockerOwnershipService service = new DockerOwnershipService(() -> identity, () -> "0.2.0", false);

        Map<String, String> labels = service.labels("vaultwarden", "appinst_123", "autarkos_homelab-box_vaultwarden");

        assertThat(labels).containsEntry("autark-os.managed", "true")
                .containsEntry("autark-os.instance-id", "pos_abcdef1234567890")
                .containsEntry("autark-os.runtime-root-hash", "sha256:runtimehash")
                .containsEntry("autark-os.app-id", "vaultwarden")
                .containsEntry("autark-os.app-instance-id", "appinst_123")
                .containsEntry("autark-os.compose-project", "autarkos_homelab-box_vaultwarden")
                .containsEntry("autark-os.version", "0.2.0");
    }

    @Test
    void convertsLabelsToComposeYamlEntries() {
        DockerOwnershipService service = new DockerOwnershipService(() -> identity, () -> "0.2.0", false);

        assertThat(service.composeLabelEntries("vaultwarden", "appinst_123", "autarkos_homelab-box_vaultwarden"))
                .contains("autark-os.managed=true")
                .contains("autark-os.instance-id=pos_abcdef1234567890")
                .contains("autark-os.app-id=vaultwarden");
    }

    @Test
    void classifiesOwnedForeignLegacyAndUnmanagedContainers() {
        DockerOwnershipService service = new DockerOwnershipService(() -> identity, () -> "0.2.0", false);

        assertThat(service.classify("autarkos_homelab-box_vaultwarden_1", service.labels("vaultwarden", "appinst_123", "autarkos_homelab-box_vaultwarden")).ownership())
                .isEqualTo(DockerResourceOwnership.OWNED);
        assertThat(service.classify("autarkos_other_vaultwarden_1", Map.of(
                "autark-os.managed", "true",
                "autark-os.instance-id", "pos_other",
                "autark-os.runtime-root-hash", "sha256:runtimehash",
                "autark-os.app-id", "vaultwarden")).ownership())
                .isEqualTo(DockerResourceOwnership.FOREIGN);
        assertThat(service.classify("autark-os-vaultwarden", Map.of("autark-os.managed", "true", "autark-os.app-id", "vaultwarden")).ownership())
                .isEqualTo(DockerResourceOwnership.LEGACY_UNSCOPED);
        assertThat(service.classify("redis", Map.of()).ownership())
                .isEqualTo(DockerResourceOwnership.UNMANAGED);
    }

    @Test
    void parsesDockerLabelOutput() {
        DockerOwnershipService service = new DockerOwnershipService(() -> identity, () -> "0.2.0", false);

        Map<String, String> labels = service.parseLabels(List.of(
                "autark-os.managed=true",
                "autark-os.instance-id=pos_abcdef1234567890",
                "autark-os.app-id=vaultwarden"));

        assertThat(labels).containsEntry("autark-os.managed", "true")
                .containsEntry("autark-os.instance-id", "pos_abcdef1234567890")
                .containsEntry("autark-os.app-id", "vaultwarden");
    }
}
