package com.autarkos.testsupport;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import com.autarkos.host.DockerInventoryService;
import com.autarkos.host.DockerInventorySnapshot;
import com.autarkos.host.HostModels;
import com.autarkos.marketplace.install.DockerResourceOwnership;
import com.autarkos.marketplace.install.models.RuntimeModels;

public final class DockerInventoryTestData {

    private DockerInventoryTestData() {
    }

    public static DockerInventorySnapshot empty() {
        return DockerInventorySnapshot.available(Instant.parse("2026-06-20T12:00:00Z"), "current-instance", List.of());
    }

    public static DockerInventorySnapshot unavailable(String diagnostic) {
        return DockerInventorySnapshot.unavailable(
                Instant.parse("2026-06-20T12:00:00Z"), "current-instance", diagnostic);
    }

    public static DockerInventorySnapshot fromManaged(List<Container> containers) {
        return DockerInventorySnapshot.available(
                Instant.parse("2026-06-20T12:00:00Z"),
                "current-instance",
                containers.stream().map(container -> new DockerInventorySnapshot.Container(
                        new HostModels.HostDockerContainer(
                                container.containerName(), "test:latest", container.status(),
                                Map.of("com.docker.compose.service", "app"), ""),
                        new RuntimeModels.DockerResourceClassification(
                                container.ownership(), container.appId(), container.appInstanceId(), container.composeProject())))
                        .toList());
    }

    public static DockerInventorySnapshot fromRuntime(
            String appId,
            String appInstanceId,
            String composeProject,
            List<RuntimeModels.DockerContainerStatus> containers) {
        return DockerInventorySnapshot.available(
                Instant.parse("2026-06-20T12:00:00Z"),
                "current-instance",
                containers.stream().map(container -> new DockerInventorySnapshot.Container(
                        new HostModels.HostDockerContainer(
                                container.name(), "test:latest", container.status(),
                                Map.of("com.docker.compose.service", container.service()), container.ports()),
                        new RuntimeModels.DockerResourceClassification(
                                DockerResourceOwnership.OWNED, appId, appInstanceId, composeProject)))
                        .toList());
    }

    public static DockerInventorySnapshot external(List<HostModels.HostDockerContainer> containers) {
        return DockerInventorySnapshot.available(
                Instant.parse("2026-06-20T12:00:00Z"),
                "current-instance",
                containers.stream().map(container -> new DockerInventorySnapshot.Container(
                        container,
                        new RuntimeModels.DockerResourceClassification(
                                DockerResourceOwnership.UNMANAGED, "", "", "")))
                        .toList());
    }

    public static DockerInventoryService service(DockerInventorySnapshot snapshot) {
        return service(() -> snapshot);
    }

    public static DockerInventoryService service(Supplier<DockerInventorySnapshot> snapshots) {
        DockerInventoryService service = mock(DockerInventoryService.class);
        when(service.capture()).thenAnswer(ignored -> snapshots.get());
        when(service.requireFresh()).thenAnswer(ignored -> {
            DockerInventorySnapshot snapshot = snapshots.get();
            snapshot.requireUsable();
            return snapshot;
        });
        return service;
    }

    public record Container(
            String appId,
            String containerName,
            String status,
            DockerResourceOwnership ownership,
            String appInstanceId,
            String composeProject) {
    }
}
