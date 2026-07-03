package com.autarkos.marketplace.plan;

import java.util.List;

public record InstallPlan(
        String appId,
        String appName,
        FriendlyInstallPlan friendly,
        TechnicalInstallPlan technical,
        InstallCustomizationSummary customization,
        List<String> warnings) {
}
