package com.autarkos.system;

import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

public final class UpdateInventoryModels {

    private UpdateInventoryModels() {
    }

    public record Snapshot(
            int schemaVersion,
            Instant capturedAt,
            String ownerInstanceId,
            String runtimeRoot,
            String runtimeRootHash,
            String identityFileSha256,
            List<ManagedApp> managedApps) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ManagedApp(
            String catalogAppId,
            String appInstanceId,
            String ownerInstanceId,
            String runtimePath,
            String composeProject,
            Instant registrationInstalledAt,
            Instant ownershipCreatedAt,
            Instant runtimeMetadataCreatedAt,
            String manifestVersion,
            String savedManifestSha256,
            String composeSha256,
            List<ContainerIdentity> containers) {
    }

    public record ContainerIdentity(
            String name,
            String ownershipState,
            String appInstanceId,
            String ownerInstanceId,
            String runtimeRootHash,
            String composeProject) {
    }

    public record Violation(
            String catalogAppId,
            String code,
            String expected,
            String actual,
            String message) {
    }

    public record Verification(
            int schemaVersion,
            Instant verifiedAt,
            boolean safe,
            String summary,
            Snapshot before,
            Snapshot after,
            List<Violation> violations) {
    }
}
