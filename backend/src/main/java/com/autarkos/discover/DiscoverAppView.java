package com.autarkos.discover;

import com.autarkos.apps.ApplicationView;
import com.autarkos.marketplace.model.ApplicationManifest;

public record DiscoverAppView(
        ApplicationView application,
        ApplicationManifest app,
        String serviceKindLabel,
        String estimatedInstallTime,
        String difficulty,
        DiscoverSetupModels.DiscoverSetupSchema setupSchema) {
}
