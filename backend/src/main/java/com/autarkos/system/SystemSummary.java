package com.autarkos.system;

import java.time.Instant;
import java.util.List;

import com.autarkos.api.AutarkOsIssue;

public record SystemSummary(
        String deviceName,
        String instanceId,
        String lanUrl,
        SetupProgressSummary setup,
        DockerSummary docker,
        AccessSummary access,
        AppsSummary apps,
        BackupSummary backups,
        StorageSummary storage,
        List<AutarkOsIssue> issues,
        Instant updatedAt) {
}
