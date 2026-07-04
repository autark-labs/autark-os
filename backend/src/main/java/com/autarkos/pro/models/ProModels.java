package com.autarkos.pro.models;

import java.time.Instant;

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
            Instant createdAt,
            Instant updatedAt) {

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
                    remoteApiConfigured,
                    remoteApiHealthy);
        }

        private static boolean hasText(String value) {
            return value != null && !value.isBlank();
        }
    }
}
