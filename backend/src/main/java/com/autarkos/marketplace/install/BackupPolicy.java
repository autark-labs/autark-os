package com.autarkos.marketplace.install;

public record BackupPolicy(
        boolean enabled,
        String frequency,
        int retention) {

    public static BackupPolicy defaults() {
        return new BackupPolicy(true, "daily", 7);
    }

    public String label() {
        if (!enabled) {
            return "Disabled";
        }
        return frequency + ", keep " + retention;
    }
}
