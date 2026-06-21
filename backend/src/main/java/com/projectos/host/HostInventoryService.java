package com.projectos.host;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.projectos.marketplace.install.DockerOwnershipService;
import com.projectos.marketplace.install.DockerResourceClassification;
import com.projectos.marketplace.install.DockerResourceOwnership;
import com.projectos.system.ProjectOsIdentity;

@Service
public class HostInventoryService implements HostInventoryProvider {

    private final HostDockerContainerDiscovery containerDiscovery;
    private final DockerOwnershipService ownershipService;
    private final HostInventoryIgnoreRepository ignoreRepository;

    public HostInventoryService(
            HostDockerContainerDiscovery containerDiscovery,
            DockerOwnershipService ownershipService,
            HostInventoryIgnoreRepository ignoreRepository) {
        this.containerDiscovery = containerDiscovery;
        this.ownershipService = ownershipService;
        this.ignoreRepository = ignoreRepository;
    }

    @Override
    public List<HostInventoryResource> inventory(boolean includeIgnored) {
        ProjectOsIdentity identity = ownershipService.currentIdentity();
        Set<String> ignored = ignoreRepository.ignoredResourceIds();
        return containerDiscovery.findContainers().stream()
                .map(container -> resource(container, identity, ignored.contains(id(container.name()))))
                .filter(resource -> includeIgnored || !resource.ignored())
                .sorted(Comparator.comparing(HostInventoryResource::managementMode)
                        .thenComparing(HostInventoryResource::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public ActionResult ignore(String resourceId) {
        ignoreRepository.ignore(resourceId);
        return new ActionResult(true, "success", "Ignored found app", "Project OS will stop prompting you about this resource.", resourceId, "review_existing_apps");
    }

    public ActionResult unignore(String resourceId) {
        ignoreRepository.unignore(resourceId);
        return new ActionResult(true, "success", "Found app restored", "Project OS will include this resource in found app prompts again.", resourceId, "review_existing_apps");
    }

    private HostInventoryResource resource(HostDockerContainer container, ProjectOsIdentity identity, boolean ignored) {
        DockerResourceClassification classification = ownershipService.classify(container.name(), container.labels());
        String ownershipState = ownershipState(classification.ownership());
        String managementMode = managementMode(classification.ownership());
        String appId = clean(firstPresent(classification.appId(), container.labels().get(DockerOwnershipService.APP_ID)));
        List<String> urls = accessUrls(container.ports());
        return new HostInventoryResource(
                id(container.name()),
                displayName(appId, container.name()),
                appId,
                ownershipState,
                managementMode,
                clean(container.labels().get(DockerOwnershipService.INSTANCE_ID)),
                identity.instanceId(),
                runtimeState(container.status()),
                urls,
                "docker",
                actions(urls),
                ignored,
                riskLevel(classification.ownership()),
                summary(classification.ownership(), container.name()),
                details(container, classification));
    }

    private Map<String, String> details(HostDockerContainer container, DockerResourceClassification classification) {
        Map<String, String> details = new LinkedHashMap<>();
        details.put("containerName", container.name());
        details.put("image", container.image());
        details.put("status", container.status());
        details.put("ports", container.ports());
        details.put("appInstanceId", clean(classification.appInstanceId()));
        details.put("composeProject", clean(classification.composeProject()));
        return details;
    }

    private List<String> actions(List<String> urls) {
        List<String> actions = new ArrayList<>();
        actions.add("view_details");
        if (!urls.isEmpty()) {
            actions.add("open");
        }
        actions.add("ignore");
        return actions;
    }

    private List<String> accessUrls(String ports) {
        if (ports == null || ports.isBlank()) {
            return List.of();
        }
        List<String> urls = new ArrayList<>();
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
                urls.add("http://localhost:" + port);
            }
        }
        return urls.stream().distinct().toList();
    }

    private String ownershipState(DockerResourceOwnership ownership) {
        return switch (ownership) {
            case OWNED -> "owned_managed";
            case FOREIGN -> "foreign_project_os";
            case LEGACY_UNSCOPED -> "legacy_project_os";
            case UNMANAGED -> "external_docker";
        };
    }

    private String managementMode(DockerResourceOwnership ownership) {
        return switch (ownership) {
            case OWNED -> "managed";
            case FOREIGN, UNMANAGED -> "observed";
            case LEGACY_UNSCOPED -> "recoverable";
        };
    }

    private String riskLevel(DockerResourceOwnership ownership) {
        return switch (ownership) {
            case OWNED -> "low";
            case UNMANAGED -> "info";
            case LEGACY_UNSCOPED -> "medium";
            case FOREIGN -> "high";
        };
    }

    private String summary(DockerResourceOwnership ownership, String containerName) {
        return switch (ownership) {
            case OWNED -> "Managed by this Project OS installation.";
            case FOREIGN -> "Found on this server, but managed by another Project OS installation.";
            case LEGACY_UNSCOPED -> "Found legacy Project OS labels without current ownership metadata.";
            case UNMANAGED -> "Found Docker container not managed by Project OS: " + containerName + ".";
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

    private String displayName(String appId, String containerName) {
        return appId == null || appId.isBlank() ? containerName : appId;
    }

    private String id(String containerName) {
        return "docker:" + clean(containerName);
    }

    private String firstPresent(String first, String second) {
        return first != null && !first.isBlank() ? first : second;
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
