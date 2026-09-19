package com.autarkos.host;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.DockerResourceOwnership;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ObservedServiceScanner {

    private final ObjectMapper objectMapper = new ObjectMapper();

    public List<ObservedService> scan(DockerInventorySnapshot inventory, Instant now) {
        inventory.requireUsable();
        return inventory.containers().stream()
                .map(container -> observed(container, inventory.currentInstanceId(), now))
                .toList();
    }

    private ObservedService observed(DockerInventorySnapshot.Container inventoryContainer, String currentInstanceId, Instant now) {
        HostModels.HostDockerContainer container = inventoryContainer.observed();
        RuntimeModels.DockerResourceClassification classification = inventoryContainer.classification();
        String explicitAppId = firstPresent(
                classification.appId(),
                container.labels().get(DockerOwnershipService.APP_ID));
        String appId = firstPresent(explicitAppId, inferCatalogAppId(container.name(), container.image()));
        String ownershipState = ownershipState(classification.ownership());
        String instanceId = clean(container.labels().get(DockerOwnershipService.INSTANCE_ID));
        String url = accessUrl(container.ports());
        return new ObservedService(
                "docker:" + clean(container.name()),
                HostModels.ObservedServiceSource.DOCKER,
                clean(container.name()),
                displayName(appId, container.name()),
                url,
                "LAN",
                cleanToNull(appId),
                explicitAppId != null ? "label" : appId == null ? "unknown" : "inferred",
                ownershipState,
                runtimeState(container.status()),
                instanceId.isBlank() ? null : instanceId,
                now,
                now,
                metadata(container, currentInstanceId));
    }

    private String metadata(HostModels.HostDockerContainer container, String currentInstanceId) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("containerName", clean(container.name()));
        metadata.put("image", clean(container.image()));
        metadata.put("status", clean(container.status()));
        metadata.put("ports", clean(container.ports()));
        metadata.put("liveMounts", container.mounts().stream().map(mount -> Map.of(
                "type", clean(mount.type()),
                "source", clean(mount.source()),
                "target", clean(mount.destination()),
                "readOnly", mount.readOnly())).toList());
        metadata.put("currentInstanceId", currentInstanceId);
        putIfPresent(metadata, "catalogAppId", container.labels().get(DockerOwnershipService.APP_ID));
        putIfPresent(metadata, "managed", container.labels().get(DockerOwnershipService.MANAGED));
        putIfPresent(metadata, "composeProject", firstPresent(
                container.labels().get(DockerOwnershipService.COMPOSE_PROJECT),
                container.labels().get("com.docker.compose.project")));
        putIfPresent(metadata, "composeService", container.labels().get("com.docker.compose.service"));
        putIfPresent(metadata, "appInstanceId", container.labels().get(DockerOwnershipService.APP_INSTANCE_ID));
        putIfPresent(metadata, "autarkOsInstanceId", container.labels().get(DockerOwnershipService.INSTANCE_ID));
        putIfPresent(metadata, "runtimeRootHash", container.labels().get(DockerOwnershipService.RUNTIME_ROOT_HASH));
        try {
            return objectMapper.writeValueAsString(metadata);
        } catch (java.io.IOException exception) {
            throw new HostInventoryException("Docker inventory metadata could not be recorded.");
        }
    }

    private String ownershipState(DockerResourceOwnership ownership) {
        return switch (ownership) {
            case OWNED -> "owned_managed";
            case FOREIGN -> "foreign_autark_os";
            case LEGACY_UNSCOPED -> "legacy_autark_os";
            case UNMANAGED -> "external_docker";
        };
    }

    private String runtimeState(String status) {
        String normalized = status == null ? "" : status.toLowerCase();
        if (normalized.contains("up") || normalized.contains("running")) {
            return "running";
        }
        if (normalized.contains("exit") || normalized.contains("dead")) {
            return "stopped";
        }
        if (normalized.contains("restart")) {
            return "restarting";
        }
        return "unknown";
    }

    private String accessUrl(String ports) {
        if (ports == null || ports.isBlank()) {
            return null;
        }
        for (String part : ports.split(",")) {
            String trimmed = part.trim();
            int arrow = trimmed.indexOf("->");
            if (arrow < 0) {
                continue;
            }
            String host = trimmed.substring(0, arrow);
            int colon = host.lastIndexOf(':');
            String port = colon >= 0 ? host.substring(colon + 1) : host;
            if (port.matches("\\d+")) {
                return "http://localhost:" + port;
            }
        }
        return null;
    }

    private String inferCatalogAppId(String name, String image) {
        String value = (clean(name) + " " + clean(image)).toLowerCase(java.util.Locale.ROOT);
        for (String token : List.of("vaultwarden", "jellyfin", "homepage", "actual-budget", "paperless-ngx", "obsidian-livesync")) {
            if (value.contains(token)) {
                return token;
            }
        }
        return null;
    }

    private String displayName(String appId, String containerName) {
        return appId == null || appId.isBlank() ? clean(containerName) : appId;
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private void putIfPresent(Map<String, Object> metadata, String key, String value) {
        if (value != null && !value.isBlank()) {
            metadata.put(key, value.trim());
        }
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private String cleanToNull(String value) {
        String cleaned = clean(value);
        return cleaned.isBlank() ? null : cleaned;
    }

}
