package com.autarkos.marketplace.install.models;

import java.time.Instant;
public final class UpdateModels {

    private UpdateModels() {
    }

    public record AppUpdateCapability(
            boolean available,
            String status,
            String headline,
            String summary,
            String reasonCode,
            Instant checkedAt) {

        public static AppUpdateCapability unavailable() {
            return new AppUpdateCapability(
                    false,
                    "unsupported",
                    "App updates are not available yet",
                    "Autark-OS keeps managed app updates disabled until it can preserve saved settings, secrets, access, and recovery state through a reversible update job.",
                    "settings_preserving_updates_not_implemented",
                    Instant.now());
        }
    }
}
