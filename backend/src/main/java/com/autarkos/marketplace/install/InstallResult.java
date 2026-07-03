package com.autarkos.marketplace.install;

import java.util.List;

import com.autarkos.marketplace.plan.InstallPlan;

public record InstallResult(
        String appId,
        String appName,
        String status,
        String message,
        String accessUrl,
        InstallPlan plan,
        List<InstallStep> steps,
        List<String> logs,
        PostInstallGuide postInstallGuide,
        AppSetupGuide setupGuide) {
}
