package com.autarkos.system;

import java.util.List;
import java.util.Optional;

import com.autarkos.api.AutarkOsAction;

public record RecommendedAction(
        String id,
        String severity,
        String title,
        String body,
        Optional<AutarkOsAction> primaryAction,
        Optional<AutarkOsAction> secondaryAction,
        List<String> sourceIssueIds) {
}
