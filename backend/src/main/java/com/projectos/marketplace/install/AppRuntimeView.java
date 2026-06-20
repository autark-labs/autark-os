package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.List;

import com.projectos.marketplace.model.ConfigurationItem;

public record AppRuntimeView(
        String appId,
        String appName,
        String category,
        String description,
        String version,
        String image,
        String friendlyStatus,
        String technicalStatus,
        String healthCheck,
        String runtimePath,
        String composeProject,
        String accessUrl,
        AccessDesiredState desiredAccess,
        AccessObservedState observedAccess,
        Instant installedAt,
        String lastBackup,
        InstallSettings settings,
        AppTelemetry telemetry,
        AppHealthSnapshot healthSnapshot,
        PostInstallGuide usageGuide,
        AppSetupGuide setupGuide,
        List<ConfigurationItem> appConfiguration,
        List<AppEvent> recentEvents) {
}
