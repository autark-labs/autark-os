package com.projectos.marketplace.plan;

import java.util.Map;

import com.projectos.marketplace.install.BackupPolicy;

public record InstallCustomizationSummary(
        String accessUrl,
        boolean tailscaleEnabled,
        Map<String, String> storageSubfolders,
        Map<String, String> storageHostPaths,
        BackupPolicy backup) {
}
