package com.autarkos.apps;

import java.util.List;

import com.autarkos.api.AutarkOsIssue;
import com.autarkos.host.ObservedServiceView;
import com.autarkos.marketplace.install.AppRuntimeView;

public record ApplicationView(
        String id,
        String name,
        String category,
        String image,
        String summary,
        String description,
        ApplicationRelationship relationship,
        String catalogAvailability,
        String appInstanceId,
        String runtimeState,
        String ownershipState,
        String accessState,
        String backupState,
        List<AutarkOsIssue> issues,
        String relationshipLabel,
        String relationshipDescription,
        String statusTone,
        String cardTone,
        boolean installCopyWarningRequired,
        String reviewExistingHref,
        ApplicationAction primaryAction,
        List<ApplicationAction> availableActions,
        AppRuntimeView runtime,
        ObservedServiceView evidence) {

    public boolean managed() {
        return relationship == ApplicationRelationship.MANAGED;
    }
}
