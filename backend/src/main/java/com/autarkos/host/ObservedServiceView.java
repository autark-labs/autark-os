package com.autarkos.host;

import java.util.List;
import java.util.Map;

public record ObservedServiceView(
        String id,
        String source,
        String displayName,
        String url,
        String category,
        String accessScope,
        String catalogAppId,
        String catalogMatchConfidence,
        String userStatus,
        String userStatusLabel,
        String userStatusDescription,
        String managementState,
        String readinessState,
        String attentionState,
        String ownershipState,
        String runtimeState,
        boolean pinned,
        boolean managedByThisAutarkOs,
        boolean adoptable,
        boolean duplicateInstallWarningRequired,
        List<ObservedServiceAction> availableActions,
        Map<String, String> metadata) {
}
