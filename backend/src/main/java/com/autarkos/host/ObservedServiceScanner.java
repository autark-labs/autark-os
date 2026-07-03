package com.autarkos.host;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.DockerResourceClassification;
import com.autarkos.marketplace.install.DockerResourceOwnership;
import com.autarkos.system.AutarkOsIdentity;

@Service
public class ObservedServiceScanner {

    private final HostDockerContainerDiscovery containerDiscovery;
    private final Supplier<AutarkOsIdentity> currentIdentity;
    private final DockerOwnershipService ownershipService;

    public ObservedServiceScanner(HostDockerContainerDiscovery containerDiscovery, Supplier<AutarkOsIdentity> currentIdentity) {
        this(containerDiscovery, currentIdentity, null);
    }

    @Autowired
    public ObservedServiceScanner(
            HostDockerContainerDiscovery containerDiscovery,
            DockerOwnershipService ownershipService) {
        this(containerDiscovery, ownershipService::currentIdentity, ownershipService);
    }

    private ObservedServiceScanner(
            HostDockerContainerDiscovery containerDiscovery,
            Supplier<AutarkOsIdentity> currentIdentity,
            DockerOwnershipService ownershipService) {
        this.containerDiscovery = containerDiscovery;
        this.currentIdentity = currentIdentity;
        this.ownershipService = ownershipService;
    }

    public List<ObservedService> scan(Instant now) {
        AutarkOsIdentity identity = currentIdentity.get();
        return containerDiscovery.findContainers().stream()
                .map(container -> observed(container, identity, now))
                .toList();
    }

    private ObservedService observed(HostDockerContainer container, AutarkOsIdentity identity, Instant now) {
        DockerResourceClassification classification = ownershipService == null
                ? null
                : ownershipService.classify(container.name(), container.labels());
        String appId = firstPresent(
                classification == null ? null : classification.appId(),
                container.labels().get(DockerOwnershipService.APP_ID),
                inferCatalogAppId(container.name(), container.image()));
        String ownershipState = ownershipState(classification == null ? DockerResourceOwnership.UNMANAGED : classification.ownership());
        String instanceId = clean(container.labels().get(DockerOwnershipService.INSTANCE_ID));
        String url = accessUrl(container.ports());
        return new ObservedService(
                "docker:" + clean(container.name()),
                ObservedServiceSource.DOCKER,
                clean(container.name()),
                displayName(appId, container.name()),
                url,
                "External",
                "LAN",
                cleanToNull(appId),
                appId == null || appId.isBlank() ? "unknown" : "inferred",
                ownershipState,
                "observed",
                runtimeState(container.status()),
                false,
                instanceId.isBlank() ? null : instanceId,
                now,
                now,
                null,
                null,
                metadata(container, identity));
    }

    private String metadata(HostDockerContainer container, AutarkOsIdentity identity) {
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("containerName", clean(container.name()));
        metadata.put("image", clean(container.image()));
        metadata.put("status", clean(container.status()));
        metadata.put("ports", clean(container.ports()));
        metadata.put("currentInstanceId", identity.instanceId());
        putIfPresent(metadata, "composeProject", firstPresent(
                container.labels().get(DockerOwnershipService.COMPOSE_PROJECT),
                container.labels().get("com.docker.compose.project")));
        putIfPresent(metadata, "appInstanceId", container.labels().get(DockerOwnershipService.APP_INSTANCE_ID));
        putIfPresent(metadata, "autarkOsInstanceId", container.labels().get(DockerOwnershipService.INSTANCE_ID));
        putIfPresent(metadata, "runtimeRootHash", container.labels().get(DockerOwnershipService.RUNTIME_ROOT_HASH));
        return "{"
                + metadata.entrySet().stream()
                .map(entry -> "\"" + escape(entry.getKey()) + "\":\"" + escape(entry.getValue()) + "\"")
                .collect(java.util.stream.Collectors.joining(","))
                + "}";
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

    private void putIfPresent(Map<String, String> metadata, String key, String value) {
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

    private String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
