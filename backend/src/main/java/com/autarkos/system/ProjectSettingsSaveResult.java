package com.autarkos.system;

public record ProjectSettingsSaveResult(
        ProjectSettings settings,
        ProjectSettingsAppDefaultsResult appDefaults) {
}
