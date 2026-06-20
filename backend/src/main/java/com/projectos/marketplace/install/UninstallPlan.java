package com.projectos.marketplace.install;

import java.util.List;

public record UninstallPlan(
        String appId,
        String appName,
        String headline,
        boolean safetyCheckpointPlanned,
        String safetyCheckpointMessage,
        List<String> willStop,
        List<String> willKeep,
        List<String> needsConfirmation) {
}
