package com.autarkos.pro.product;

import java.time.Instant;
import java.util.List;

/**
 * Generated shape for docs/pro/contracts/pro-product-state-v1.schema.json.
 * Schema SHA-256:
 * 9333c01b96f9843eb46132cfbe2d25f0aaf5b829c2ae6d122c1bf5d0e95f3ca3.
 * Presentation state never grants authority; signed lifecycle inputs remain
 * independently enforced by their owning services.
 */
public record ProProductState(
        String schemaVersion,
        String overallStatus,
        SoftwareEntitlement softwareEntitlement,
        HostedServices hostedServices,
        Agent agent,
        Guardian guardian,
        Mobile localMobile,
        HostedMobile hostedMobile,
        List<String> localCapabilities,
        List<String> hostedCapabilities,
        RecommendedAction recommendedAction,
        Instant checkedAt) {

    public record SoftwareEntitlement(
            String state,
            boolean localUseAllowed,
            boolean updatesAllowed,
            Instant updatesThrough,
            String reasonCode) {
    }

    public record HostedServices(
            String state,
            boolean allowed,
            Instant servicesThrough,
            Instant lastVerifiedAt,
            String reasonCode) {
    }

    public record Agent(
            String state,
            String health,
            String compatibility,
            String componentVersion,
            String digestPrefix,
            Instant lastTransitionAt,
            String reasonCode) {
    }

    public record Guardian(
            String state,
            String schedulerState,
            String latestAnalysisHealth,
            Instant latestAnalysisAt,
            Instant nextAnalysisAt,
            String reasonCode) {
    }

    public record Mobile(
            String state,
            int pairedDeviceCount,
            String reasonCode) {
    }

    public record HostedMobile(
            String state,
            int linkedDeviceCount,
            String relayState,
            Instant lastRelayAt,
            String reasonCode) {
    }

    public record RecommendedAction(String id, String reasonCode) {
    }
}
