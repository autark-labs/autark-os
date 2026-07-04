package com.autarkos.pro.models;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class ProRemoteModels {

    private ProRemoteModels() {
    }

    public record RegisterInstallRequest(
            String clientName,
            String autarkVersion,
            String agentVersion,
            String platform,
            String hostnameHash) {
    }

    public record RegisterInstallResponse(
            String installId,
            String installToken,
            Instant registeredAt) {
    }

    public record RedeemLicenseRequest(
            String installId,
            String licenseCode) {
    }

    public record RedeemLicenseResponse(
            String plan,
            String entitlementStatus,
            Instant entitlementExpiresAt,
            String userMessage) {
    }

    public record HeartbeatRequest(
            String installId,
            Instant generatedAt,
            Map<String, Object> payload) {
    }

    public record HeartbeatResponse(
            String result,
            Instant receivedAt,
            String userMessage) {
    }

    public record ProFeedResponse(
            Instant syncedAt,
            List<ProFeedItem> items,
            int advisoryCount,
            int deviceProfileCount,
            int blueprintCount) {

        public ProFeedResponse(Instant syncedAt, List<ProFeedItem> items) {
            this(syncedAt, items, items == null ? 0 : items.size(), 0, 0);
        }
    }

    public record ProFeedItem(
            String id,
            String title,
            String body,
            String severity,
            Instant publishedAt) {
    }
}
