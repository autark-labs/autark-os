package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.List;

public record PrivateAccessReconciliationItem(
        String appId,
        String appName,
        String status,
        String message,
        String detail,
        String actionLabel,
        String expectedPrivateUrl,
        String actualPrivateUrl,
        Integer expectedPort,
        Integer actualPort,
        String target,
        Integer expectedLocalPort,
        Integer expectedHttpsPort,
        String storedPrivateUrl,
        String desiredMapping,
        List<String> liveMappings,
        String matchReason,
        Instant verifiedAt) {
}
