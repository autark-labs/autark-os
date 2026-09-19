package com.autarkos.host;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import com.autarkos.marketplace.install.DockerResourceOwnership;
import com.autarkos.marketplace.install.models.RuntimeModels;

/** One immutable, ownership-classified view of Docker for a single state generation. */
public record DockerInventorySnapshot(
        Instant capturedAt,
        String currentInstanceId,
        boolean available,
        List<Container> containers,
        String diagnostic) {

    public DockerInventorySnapshot {
        containers = List.copyOf(containers == null ? List.of() : containers);
        diagnostic = diagnostic == null ? "" : diagnostic.trim();
        currentInstanceId = currentInstanceId == null ? "" : currentInstanceId.trim();
    }

    public static DockerInventorySnapshot available(
            Instant capturedAt,
            String currentInstanceId,
            List<Container> containers) {
        return new DockerInventorySnapshot(capturedAt, currentInstanceId, true, containers, "");
    }

    public static DockerInventorySnapshot unavailable(
            Instant capturedAt,
            String currentInstanceId,
            String diagnostic) {
        return new DockerInventorySnapshot(capturedAt, currentInstanceId, false, List.of(), diagnostic);
    }

    public List<RuntimeModels.DockerContainerStatus> ownedContainersFor(String appId, String composeProject) {
        return ownedContainerEvidenceFor(appId, composeProject).stream()
                .map(Container::runtimeStatus)
                .toList();
    }

    public List<Container> ownedContainerEvidenceFor(String appId, String composeProject) {
        return containers.stream()
                .filter(container -> container.classification().ownership() == DockerResourceOwnership.OWNED)
                .filter(container -> clean(appId).equals(clean(container.classification().appId())))
                .filter(container -> clean(composeProject).isBlank()
                        || clean(composeProject).equals(clean(container.classification().composeProject())))
                .toList();
    }

    public void requireUsable() {
        if (!available) {
            throw new HostInventoryException("Docker inventory failed. Previous application state is retained until Docker responds again."
                    + (diagnostic.isBlank() ? "" : " " + diagnostic));
        }
    }

    public void requireMutationOwnership(String appId) {
        requireUsable();
        if (hasOwnershipConflict(appId)) {
            throw new HostInventoryException("Autark-OS found containers for this app that are not owned by this installation. No changes were made.");
        }
    }

    public boolean hasOwnershipConflict(String appId) {
        return containers.stream()
                .map(Container::classification)
                .filter(classification -> clean(appId).equals(clean(classification.appId())))
                .anyMatch(classification -> classification.ownership() != DockerResourceOwnership.OWNED);
    }

    public record Container(
            HostModels.HostDockerContainer observed,
            RuntimeModels.DockerResourceClassification classification) {

        public RuntimeModels.DockerContainerStatus runtimeStatus() {
            String status = clean(observed.status());
            String normalized = status.toLowerCase(Locale.ROOT);
            String state = normalized.contains("restarting") ? "restarting"
                    : normalized.contains("up") || normalized.contains("running") ? "running"
                    : normalized.contains("exited") ? "exited"
                    : normalized.contains("dead") ? "dead"
                    : normalized.contains("removing") ? "removing"
                    : normalized.contains("created") ? "created"
                    : "unknown";
            String health = normalized.contains("unhealthy") ? "unhealthy"
                    : normalized.contains("health: starting") || normalized.contains("(starting)") ? "starting"
                    : normalized.contains("healthy") ? "healthy" : "";
            return new RuntimeModels.DockerContainerStatus(
                    observed.name(),
                    clean(observed.labels().get("com.docker.compose.service")),
                    state,
                    health,
                    status,
                    observed.ports());
        }
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
