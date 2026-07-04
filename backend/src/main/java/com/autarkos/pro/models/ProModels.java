package com.autarkos.pro.models;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class ProModels {

    public static final class EntitlementStatus {
        public static final String NONE = "none";

        private EntitlementStatus() {
        }
    }

    public static final class Mode {
        public static final String FREE = "free";

        private Mode() {
        }
    }

    private ProModels() {
    }

    public record ProSettings(
            boolean enabled,
            String mode,
            String installId,
            String installTokenProtected,
            boolean accountLinked,
            String accountEmail,
            String plan,
            String entitlementStatus,
            Instant entitlementExpiresAt,
            boolean healthReportingEnabled,
            boolean alertsEnabled,
            boolean proFeedEnabled,
            boolean configSnapshotEnabled,
            Instant lastHeartbeatAt,
            String lastHeartbeatResult,
            Instant lastEntitlementCheckAt,
            Instant lastFeedSyncAt,
            int feedAdvisoryCount,
            int feedDeviceProfileCount,
            int feedBlueprintCount,
            Instant createdAt,
            Instant updatedAt) {

        public ProSettings(
                boolean enabled,
                String mode,
                String installId,
                String installTokenProtected,
                boolean accountLinked,
                String accountEmail,
                String plan,
                String entitlementStatus,
                Instant entitlementExpiresAt,
                boolean healthReportingEnabled,
                boolean alertsEnabled,
                boolean proFeedEnabled,
                boolean configSnapshotEnabled,
                Instant lastHeartbeatAt,
                String lastHeartbeatResult,
                Instant lastEntitlementCheckAt,
                Instant lastFeedSyncAt,
                Instant createdAt,
                Instant updatedAt) {
            this(
                    enabled,
                    mode,
                    installId,
                    installTokenProtected,
                    accountLinked,
                    accountEmail,
                    plan,
                    entitlementStatus,
                    entitlementExpiresAt,
                    healthReportingEnabled,
                    alertsEnabled,
                    proFeedEnabled,
                    configSnapshotEnabled,
                    lastHeartbeatAt,
                    lastHeartbeatResult,
                    lastEntitlementCheckAt,
                    lastFeedSyncAt,
                    0,
                    0,
                    0,
                    createdAt,
                    updatedAt);
        }

        public static ProSettings defaults(Instant now) {
            return new ProSettings(
                    false,
                    Mode.FREE,
                    null,
                    null,
                    false,
                    null,
                    null,
                    EntitlementStatus.NONE,
                    null,
                    true,
                    true,
                    true,
                    false,
                    null,
                    null,
                    null,
                    null,
                    0,
                    0,
                    0,
                    now,
                    now);
        }
    }

    public record ProStatus(
            boolean enabled,
            String mode,
            boolean registered,
            String installId,
            boolean accountLinked,
            String accountEmail,
            String plan,
            String entitlementStatus,
            Instant entitlementExpiresAt,
            boolean healthReportingEnabled,
            boolean alertsEnabled,
            boolean proFeedEnabled,
            boolean configSnapshotEnabled,
            Instant lastHeartbeatAt,
            String lastHeartbeatResult,
            Instant lastEntitlementCheckAt,
            Instant lastFeedSyncAt,
            int feedAdvisoryCount,
            int feedDeviceProfileCount,
            int feedBlueprintCount,
            boolean remoteApiConfigured,
            Boolean remoteApiHealthy) {

        public static ProStatus from(ProSettings settings, boolean remoteApiConfigured, Boolean remoteApiHealthy) {
            return new ProStatus(
                    settings.enabled(),
                    settings.mode(),
                    hasText(settings.installId()),
                    settings.installId(),
                    settings.accountLinked(),
                    settings.accountEmail(),
                    settings.plan(),
                    settings.entitlementStatus(),
                    settings.entitlementExpiresAt(),
                    settings.healthReportingEnabled(),
                    settings.alertsEnabled(),
                    settings.proFeedEnabled(),
                    settings.configSnapshotEnabled(),
                    settings.lastHeartbeatAt(),
                    settings.lastHeartbeatResult(),
                    settings.lastEntitlementCheckAt(),
                    settings.lastFeedSyncAt(),
                    settings.feedAdvisoryCount(),
                    settings.feedDeviceProfileCount(),
                    settings.feedBlueprintCount(),
                    remoteApiConfigured,
                    remoteApiHealthy);
        }

        private static boolean hasText(String value) {
            return value != null && !value.isBlank();
        }
    }

    public record ProPrivacyPayloadPreview(
            Instant generatedAt,
            Map<String, Object> payload,
            List<String> maySend,
            List<String> neverSends) {
    }
}
