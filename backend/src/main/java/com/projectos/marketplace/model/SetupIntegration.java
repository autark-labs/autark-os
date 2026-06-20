package com.projectos.marketplace.model;

import java.util.List;

public record SetupIntegration(
        String id,
        String name,
        String targetAppId,
        String description,
        boolean requiresApproval,
        List<String> plannedActions) {
}
