package com.autarkos.marketplace.install;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.model.ApplicationManifest;

@Service
public class AppReconciliationService {

    private final InstalledAppRepository repository;
    private final ManagedContainerDiscovery managedContainerDiscovery;
    private final MarketplaceCatalogService catalogService;

    public AppReconciliationService(
            InstalledAppRepository repository,
            ManagedContainerDiscovery managedContainerDiscovery,
            MarketplaceCatalogService catalogService) {
        this.repository = repository;
        this.managedContainerDiscovery = managedContainerDiscovery;
        this.catalogService = catalogService;
    }

    public List<AppReconciliationItem> reconcile() {
        List<InstalledApp> installedApps = repository.findAll();
        List<ManagedContainer> containers = managedContainerDiscovery.findManagedContainers();
        Map<String, List<ManagedContainer>> containersByApp = containers.stream()
                .filter(container -> container.appId() != null && !container.appId().isBlank())
                .collect(Collectors.groupingBy(ManagedContainer::appId));

        List<AppReconciliationItem> items = new ArrayList<>();
        Set<String> seenAppIds = new LinkedHashSet<>();
        for (InstalledApp app : installedApps) {
            seenAppIds.add(app.appId());
            items.add(reconcileInstalled(app, containersByApp.getOrDefault(app.appId(), List.of())));
        }
        containersByApp.entrySet().stream()
                .filter(entry -> !seenAppIds.contains(entry.getKey()))
                .forEach(entry -> items.add(reconcileUnregistered(entry.getKey(), entry.getValue())));
        return items.stream()
                .sorted(Comparator.comparing(AppReconciliationItem::appName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private AppReconciliationItem reconcileInstalled(InstalledApp app, List<ManagedContainer> containers) {
        InstalledAppOwnershipMetadata metadata = repository.ownershipFor(app.appId()).orElse(null);
        if (metadata != null && !isOwnedMetadata(metadata)) {
            return item(app.appId(), app.appName(), "Managed elsewhere", ownershipFrom(metadata), false, "Stored app metadata is not owned by this Autark-OS instance.");
        }
        if (containers.isEmpty()) {
            return item(app.appId(), app.appName(), "Missing", DockerResourceOwnership.OWNED, false, "No owned containers were found for this app.");
        }
        DockerResourceOwnership ownership = strongestOwnership(containers);
        if (ownership == DockerResourceOwnership.FOREIGN) {
            return item(app.appId(), app.appName(), "Managed elsewhere", ownership, false, "Docker reports containers owned by another Autark-OS instance.");
        }
        if (ownership == DockerResourceOwnership.LEGACY_UNSCOPED) {
            if (isExplicitlyAdopted(metadata)) {
                String status = statusFromContainers(containers);
                return item(app.appId(), app.appName(), status, DockerResourceOwnership.OWNED, lifecycleEligible(status, DockerResourceOwnership.OWNED), "Autark-OS explicitly adopted this legacy container.");
            }
            return item(app.appId(), app.appName(), "Needs attention", ownership, false, "Docker reports legacy Autark-OS containers without instance ownership labels.");
        }
        String status = statusFromContainers(containers);
        return item(app.appId(), app.appName(), status, ownership, lifecycleEligible(status, ownership), "Reconciled from owned Docker containers.");
    }

    private AppReconciliationItem reconcileUnregistered(String appId, List<ManagedContainer> containers) {
        DockerResourceOwnership ownership = strongestOwnership(containers);
        String name = catalogService.findById(appId).map(ApplicationManifest::name).orElse(appId);
        if (ownership == DockerResourceOwnership.OWNED) {
            return item(appId, name, "Needs setup", ownership, false, "Owned containers exist, but no installed app record was found.");
        }
        return item(appId, name, "Managed elsewhere", ownership, false, "Containers are not eligible for automatic adoption.");
    }

    private boolean isOwnedMetadata(InstalledAppOwnershipMetadata metadata) {
        return "owned".equalsIgnoreCase(metadata.ownershipStatus()) || metadata.ownershipStatus().isBlank();
    }

    private boolean isExplicitlyAdopted(InstalledAppOwnershipMetadata metadata) {
        if (metadata == null || !isOwnedMetadata(metadata)) {
            return false;
        }
        return "adopted".equalsIgnoreCase(metadata.installState())
                || "recovered".equalsIgnoreCase(metadata.installState());
    }

    private DockerResourceOwnership ownershipFrom(InstalledAppOwnershipMetadata metadata) {
        if ("legacy_unscoped".equalsIgnoreCase(metadata.ownershipStatus())) {
            return DockerResourceOwnership.LEGACY_UNSCOPED;
        }
        if ("foreign".equalsIgnoreCase(metadata.ownershipStatus()) || "managed_elsewhere".equalsIgnoreCase(metadata.ownershipStatus())) {
            return DockerResourceOwnership.FOREIGN;
        }
        return DockerResourceOwnership.UNMANAGED;
    }

    private DockerResourceOwnership strongestOwnership(List<ManagedContainer> containers) {
        if (containers.stream().anyMatch(container -> container.ownership() == DockerResourceOwnership.FOREIGN)) {
            return DockerResourceOwnership.FOREIGN;
        }
        if (containers.stream().anyMatch(container -> container.ownership() == DockerResourceOwnership.LEGACY_UNSCOPED)) {
            return DockerResourceOwnership.LEGACY_UNSCOPED;
        }
        if (containers.stream().anyMatch(container -> container.ownership() == DockerResourceOwnership.OWNED)) {
            return DockerResourceOwnership.OWNED;
        }
        return DockerResourceOwnership.UNMANAGED;
    }

    private String statusFromContainers(List<ManagedContainer> containers) {
        String joined = containers.stream()
                .map(ManagedContainer::status)
                .map(value -> value == null ? "" : value.toLowerCase())
                .reduce("", (left, right) -> left + " " + right);
        if (joined.contains("unhealthy") || joined.contains("error")) {
            return "Needs attention";
        }
        if (joined.contains("restarting") || joined.contains("starting") || joined.contains("created")) {
            return "Starting";
        }
        if (joined.contains("exited") || joined.contains("dead")) {
            return "Stopped";
        }
        if (joined.contains("up") || joined.contains("running")) {
            return "Ready";
        }
        return "Starting";
    }

    private boolean lifecycleEligible(String status, DockerResourceOwnership ownership) {
        return ownership == DockerResourceOwnership.OWNED
                && ("Ready".equals(status) || "Starting".equals(status) || "Stopped".equals(status));
    }

    private AppReconciliationItem item(String appId, String appName, String status, DockerResourceOwnership ownership, boolean lifecycleEligible, String detail) {
        return new AppReconciliationItem(appId, appName, status, ownership, lifecycleEligible, detail);
    }
}
