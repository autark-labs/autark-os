package com.autarkos.apps;

import java.time.Instant;
import java.util.List;

import com.autarkos.api.AutarkOsStates;
public record ApplicationState(
        List<ApplicationView> applications,
        Instant updatedAt,
        String refreshStatus,
        Instant refreshStartedAt,
        Instant refreshCompletedAt,
        boolean stale,
        String lastError,
        Instant nextRefreshAt) {

    public ApplicationState(
            List<ApplicationView> applications,
            Instant updatedAt) {
        this(
                applications,
                updatedAt,
                AutarkOsStates.SnapshotState.IDLE,
                updatedAt,
                updatedAt,
                false,
                "",
                null);
    }
}
