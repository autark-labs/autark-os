package com.autarkos.marketplace.install;

import java.util.List;

public record AppSettingsChangePlan(
        String appId,
        String appName,
        String impact,
        String headline,
        String summary,
        boolean saveAllowed,
        boolean redeployRequired,
        boolean restartRequired,
        boolean dataMigrationRequired,
        List<String> changes,
        List<String> warnings,
        List<String> blockedReasons) {
}
