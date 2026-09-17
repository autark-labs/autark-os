package com.autarkos.host;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.DockerResourceOwnership;
import com.autarkos.system.AutarkOsIdentity;

class DockerInventoryServiceTests {

    @Test
    void capturesAndClassifiesTheWholeHostAgainstOneIdentityGeneration() {
        AtomicInteger discoveryCalls = new AtomicInteger();
        AtomicInteger identityReads = new AtomicInteger();
        AutarkOsIdentity identity = identity();
        HostDockerContainerDiscovery discovery = () -> {
            discoveryCalls.incrementAndGet();
            return HostDockerContainerDiscovery.DockerInventory.successful(List.of(
                    container("vault", Map.of(
                            DockerOwnershipService.MANAGED, "true",
                            DockerOwnershipService.APP_ID, "vaultwarden",
                            DockerOwnershipService.APP_INSTANCE_ID, "appinst_vaultwarden",
                            DockerOwnershipService.COMPOSE_PROJECT, "autarkos_vaultwarden",
                            DockerOwnershipService.INSTANCE_ID, identity.instanceId(),
                            DockerOwnershipService.RUNTIME_ROOT_HASH, identity.runtimeRootHash(),
                            "com.docker.compose.service", "vaultwarden")),
                    container("external", Map.of())));
        };
        DockerOwnershipService ownership = new DockerOwnershipService(() -> {
            identityReads.incrementAndGet();
            return identity;
        }, () -> "test", false);

        DockerInventorySnapshot snapshot = new DockerInventoryService(discovery, ownership).requireFresh();

        assertThat(discoveryCalls).hasValue(1);
        assertThat(identityReads).hasValue(1);
        assertThat(snapshot.containers()).hasSize(2);
        assertThat(snapshot.containers().get(0).classification().ownership()).isEqualTo(DockerResourceOwnership.OWNED);
        assertThat(snapshot.containers().get(1).classification().ownership()).isEqualTo(DockerResourceOwnership.UNMANAGED);
        assertThat(snapshot.ownedContainersFor("vaultwarden", "autarkos_vaultwarden"))
                .singleElement()
                .satisfies(container -> {
                    assertThat(container.service()).isEqualTo("vaultwarden");
                    assertThat(container.state()).isEqualTo("running");
                    assertThat(container.health()).isEqualTo("healthy");
                });
    }

    @Test
    void successfulEmptyAndUnavailableInventoriesRemainDistinct() {
        DockerOwnershipService ownership = new DockerOwnershipService(this::identity, () -> "test", false);
        DockerInventorySnapshot empty = new DockerInventoryService(
                () -> HostDockerContainerDiscovery.DockerInventory.successful(List.of()), ownership).capture();
        DockerInventorySnapshot unavailable = new DockerInventoryService(
                () -> HostDockerContainerDiscovery.DockerInventory.failed("daemon offline"), ownership).capture();

        assertThat(empty.available()).isTrue();
        assertThat(empty.containers()).isEmpty();
        assertThat(unavailable.available()).isFalse();
        assertThat(unavailable.diagnostic()).contains("daemon offline");
    }

    private HostModels.HostDockerContainer container(String name, Map<String, String> labels) {
        return new HostModels.HostDockerContainer(
                name, "test:latest", "Up 1 minute (healthy)", labels,
                "127.0.0.1:8090->80/tcp",
                List.of(new HostModels.HostDockerMount("bind", "/data", "/data", false)));
    }

    private AutarkOsIdentity identity() {
        return new AutarkOsIdentity(
                "current-instance", "autark-os", "/var/lib/autark-os", "runtime-hash",
                Instant.parse("2026-06-20T12:00:00Z"), 1);
    }
}
