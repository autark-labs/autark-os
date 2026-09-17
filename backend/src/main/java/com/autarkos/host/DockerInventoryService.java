package com.autarkos.host;

import java.time.Instant;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.system.AutarkOsIdentity;

@Service
public class DockerInventoryService {

    private final HostDockerContainerDiscovery discovery;
    private final DockerOwnershipService ownership;

    public DockerInventoryService(
            HostDockerContainerDiscovery discovery,
            DockerOwnershipService ownership) {
        this.discovery = discovery;
        this.ownership = ownership;
    }

    public DockerInventorySnapshot capture() {
        Instant capturedAt = Instant.now();
        AutarkOsIdentity identity = ownership.currentIdentity();
        HostDockerContainerDiscovery.DockerInventory observed = discovery.observeContainers();
        if (!observed.successful()) {
            return DockerInventorySnapshot.unavailable(capturedAt, identity.instanceId(), observed.diagnostic());
        }
        return DockerInventorySnapshot.available(
                capturedAt,
                identity.instanceId(),
                observed.containers().stream()
                        .map(container -> new DockerInventorySnapshot.Container(
                                container,
                                ownership.classify(container.name(), container.labels(), identity)))
                        .toList());
    }

    public DockerInventorySnapshot requireFresh() {
        DockerInventorySnapshot snapshot = capture();
        snapshot.requireUsable();
        return snapshot;
    }
}
