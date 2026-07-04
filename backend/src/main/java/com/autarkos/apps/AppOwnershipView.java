package com.autarkos.apps;

import java.util.List;

import com.autarkos.discover.DiscoverInstallModels;
import com.autarkos.host.ObservedServiceView;
import com.autarkos.marketplace.install.InstallModels;

public record AppOwnershipView(
        String catalogAppId,
        String name,
        String category,
        String image,
        String summary,
        String description,
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
        ObservedServiceView observedService) {
}
