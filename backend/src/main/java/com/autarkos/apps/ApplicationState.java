package com.autarkos.apps;

import java.time.Instant;
import java.util.List;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.host.ObservedServiceView;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppRuntimeView;

public record ApplicationState(
        List<AppInstanceView> managedApps,
        List<AppRuntimeView> runtimeApps,
        List<ObservedServiceView> observedServices,
        List<ObservedServiceView> pinnedExternalServices,
        List<ObservedServiceView> foundServices,
        List<AppOwnershipView> ownershipViews,
        Instant updatedAt,
        String refreshStatus,
        Instant refreshStartedAt,
        Instant refreshCompletedAt,
        boolean stale,
        String lastError,
        Instant nextRefreshAt) {

    public ApplicationState(
            List<AppInstanceView> managedApps,
            List<AppRuntimeView> runtimeApps,
            List<ObservedServiceView> observedServices,
            List<ObservedServiceView> pinnedExternalServices,
            List<ObservedServiceView> foundServices,
            List<AppOwnershipView> ownershipViews,
            Instant updatedAt) {
        this(
                managedApps,
                runtimeApps,
                observedServices,
                pinnedExternalServices,
                foundServices,
                ownershipViews,
                updatedAt,
                AutarkOsStates.SnapshotState.IDLE,
                updatedAt,
                updatedAt,
                false,
                "",
                null);
    }
}
