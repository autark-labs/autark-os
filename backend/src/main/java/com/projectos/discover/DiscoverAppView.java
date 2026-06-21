package com.projectos.discover;

import com.projectos.host.HostInventoryResource;
import com.projectos.marketplace.model.ApplicationManifest;

public record DiscoverAppView(
        String id,
        ApplicationManifest app,
        String name,
        String image,
        String summary,
        String description,
        String categoryLabel,
        String serviceKindLabel,
        String estimatedInstallTime,
        String difficulty,
        String state,
        String stateLabel,
        String stateDescription,
        String primaryAction,
        String primaryActionLabel,
        boolean installed,
        DiscoverInstalledAppSummary installedApp,
        HostInventoryResource foundResource,
        DiscoverSetupSchema setupSchema) {
}
