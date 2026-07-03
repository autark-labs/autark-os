package com.autarkos.api;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public record AutarkOsIssue(
        String id,
        String scope,
        String subjectId,
        String severity,
        String reasonCode,
        String title,
        String summary,
        Optional<AutarkOsAction> primaryAction,
        List<AutarkOsAction> secondaryActions,
        Map<String, Object> advancedDetails) {
}
