package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;

import com.autarkos.apps.ApplicationRuntimeState;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.marketplace.install.models.GuideModels;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.ReliabilityModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ConfigurationItem;

/** Runtime facts for an app owned by this Autark-OS instance. */
public record AppRuntimeView(
        String appId,
        String appName,
        String category,
        String description,
        String version,
        String image,
        ApplicationRuntimeState state,
        String runtimePath,
        String composeProject,
        String accessUrl,
        AccessModels.AppAccessRoute accessRoute,
        AccessModels.AccessDesiredState desiredAccess,
        AccessModels.AccessObservedState observedAccess,
        Instant installedAt,
        String lastBackup,
        String backupProtection,
        InstallModels.InstallSettings settings,
        RuntimeModels.AppTelemetry telemetry,
        AppHealthSnapshot healthSnapshot,
        GuideModels.PostInstallGuide usageGuide,
        GuideModels.AppSetupGuide setupGuide,
        List<ConfigurationItem> appConfiguration,
        ReliabilityModels.AppRemediationView remediation,
        List<AppEvent> recentEvents) {
}
