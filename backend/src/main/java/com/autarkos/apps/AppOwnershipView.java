package com.autarkos.apps;

import java.util.List;

import com.autarkos.discover.DiscoverInstalledAppSummary;
import com.autarkos.host.ObservedServiceView;

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
        DiscoverInstalledAppSummary installedApp,
        ObservedServiceView observedService) {
}
