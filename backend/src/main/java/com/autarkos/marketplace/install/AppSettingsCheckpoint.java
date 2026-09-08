package com.autarkos.marketplace.install;

import java.util.List;

import com.autarkos.marketplace.install.models.InstallModels.InstallSettings;
import com.autarkos.marketplace.install.models.RuntimeModels.DockerContainerStatus;

/** Private SQLite recovery data; never included in browser or diagnostics DTOs. */
record AppSettingsCheckpoint(InstalledApp app, InstallSettings settings, String compose,
        boolean running, List<DockerContainerStatus> containers, Integer privatePort,
        boolean privateChange) { }
