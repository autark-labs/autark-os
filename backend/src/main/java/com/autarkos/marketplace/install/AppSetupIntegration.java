package com.autarkos.marketplace.install;

import java.util.List;

public record AppSetupIntegration(
        String id,
        String name,
        String targetAppId,
        String status,
        String description,
        boolean requiresApproval,
        List<String> plannedActions) {
}
