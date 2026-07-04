package com.autarkos.discover;

import java.util.List;

import com.autarkos.apps.AppOwnershipAction;
import com.autarkos.apps.AppOwnershipState;
import com.autarkos.host.ObservedServiceView;
import com.autarkos.marketplace.install.InstallModels;
import com.autarkos.marketplace.model.ApplicationManifest;

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
        AppOwnershipState state,
        String stateLabel,
        String stateDescription,
        String statusTone,
        String cardTone,
        boolean installed,
        boolean ownedByCurrentInstance,
        boolean installCopyWarningRequired,
        String reviewExistingHref,
        AppOwnershipAction primaryAction,
        List<AppOwnershipAction> availableActions,
        DiscoverInstallModels.DiscoverInstalledAppSummary installedApp,
        ObservedServiceView observedService,
        DiscoverSetupModels.DiscoverSetupSchema setupSchema) {
}
