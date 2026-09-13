package com.autarkos.system;

import java.time.Instant;
import java.util.List;

public final class UpdateInventoryModels {

    private UpdateInventoryModels() {
    }

    public record Snapshot(
            int schemaVersion,
            Instant capturedAt,
            String ownerInstanceId,
            String runtimeRoot,
            String runtimeRootHash,
            List<ManagedApp> managedApps) {
    }

    public record ManagedApp(
            String catalogAppId,
            String appInstanceId,
            String ownerInstanceId,
            String runtimePath,
            String composeProject,
            String ownershipState,
            String relationship) {
    }

    public record AppOutcome(
            String catalogAppId,
            String previousRelationship,
            String currentRelationship,
            String status,
            String message) {
    }

    public record Violation(
            String catalogAppId,
            String code,
            String message) {
    }

    public record Verification(
            int schemaVersion,
            Instant verifiedAt,
            boolean safe,
            String summary,
            Snapshot before,
            Snapshot after,
            List<AppOutcome> outcomes,
            List<Violation> violations) {
    }
}
