package com.autarkos.apps;

/**
 * User-safe evidence explaining why a catalog application is not currently managed.
 * Raw host observations remain an internal implementation detail.
 */
public record ApplicationEvidence(
        String resourceId,
        String source,
        String url,
        String accessScope,
        String ownershipState,
        String runtimeState,
        String statusLabel,
        String summary,
        String appInstanceId,
        String ownerInstanceId,
        String runtimePath,
        String composeProject) {
}
