package com.projectos.host;

import java.util.List;
import java.util.Map;

public record HostInventoryResource(
        String id,
        String displayName,
        String catalogAppId,
        String ownershipState,
        String managementMode,
        String ownerInstanceId,
        String currentInstanceId,
        String runtimeState,
        List<String> accessUrls,
        String source,
        List<String> availableActions,
        boolean ignored,
        String riskLevel,
        String summary,
        Map<String, String> details) {
}
