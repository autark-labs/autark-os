package com.autarkos.marketplace.install;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.models.RuntimeModels;

@Service
public class AppReconciliationService {

    private final InstalledAppRepository repository;
    private final ManagedContainerDiscovery managedContainerDiscovery;

    public AppReconciliationService(
            InstalledAppRepository repository,
            ManagedContainerDiscovery managedContainerDiscovery) {
        this.repository = repository;
        this.managedContainerDiscovery = managedContainerDiscovery;
    }

    public List<AppReconciliationItem> reconcile() {
        List<InstalledApp> installedApps = repository.findAllApps();
        List<RuntimeModels.ManagedContainer> containers = managedContainerDiscovery.findManagedContainers();
        Map<String, List<RuntimeModels.ManagedContainer>> containersByApp = containers.stream()
                .filter(container -> container.appId() != null && !container.appId().isBlank())
                .collect(Collectors.groupingBy(RuntimeModels.ManagedContainer::appId));

        return installedApps.stream()
                .filter(this::hasCurrentOwnershipRecord)
                .filter(app -> containsOnlyCurrentContainers(containersByApp.getOrDefault(app.appId(), List.of())))
                .map(app -> reconcileInstalled(app, containersByApp.getOrDefault(app.appId(), List.of())))
                .sorted(Comparator.comparing(AppReconciliationItem::appName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private AppReconciliationItem reconcileInstalled(InstalledApp app, List<RuntimeModels.ManagedContainer> containers) {
        if (containers.isEmpty()) {
            return new AppReconciliationItem(
                    app.appId(), app.appName(), AutarkOsStates.AppStatus.MISSING,
                    "No owned containers were found for this app.");
        }
        String status = statusFromContainers(containers);
        return new AppReconciliationItem(
                app.appId(), app.appName(), status, "Reconciled from owned Docker containers.");
    }

    private boolean hasCurrentOwnershipRecord(InstalledApp app) {
        return repository.ownershipFor(app.appId()).map(this::isOwnedMetadata).orElse(true);
    }

    private boolean isOwnedMetadata(RuntimeModels.InstalledAppOwnershipMetadata metadata) {
        return "owned".equalsIgnoreCase(metadata.ownershipStatus()) || metadata.ownershipStatus().isBlank();
    }

    private boolean containsOnlyCurrentContainers(List<RuntimeModels.ManagedContainer> containers) {
        return containers.isEmpty()
                || containers.stream().allMatch(container -> container.ownership() == DockerResourceOwnership.OWNED);
    }

    private String statusFromContainers(List<RuntimeModels.ManagedContainer> containers) {
        String joined = containers.stream()
                .map(RuntimeModels.ManagedContainer::status)
                .map(value -> value == null ? "" : value.toLowerCase())
                .reduce("", (left, right) -> left + " " + right);
        if (joined.contains("unhealthy") || joined.contains("error")) {
            return AutarkOsStates.AppStatus.NEEDS_ATTENTION;
        }
        if (joined.contains("restarting") || joined.contains("starting") || joined.contains("created")) {
            return AutarkOsStates.AppStatus.STARTING;
        }
        if (joined.contains("exited") || joined.contains("dead")) {
            return AutarkOsStates.AppStatus.STOPPED;
        }
        if (joined.contains("up") || joined.contains("running")) {
            return AutarkOsStates.AppStatus.READY;
        }
        return AutarkOsStates.AppStatus.STARTING;
    }

}
