package com.autarkos.system;

import java.time.Instant;
import java.util.List;

import com.autarkos.api.AutarkOsIssue;

public final class SystemSummaryModels {

    private SystemSummaryModels() {
    }

    public record AccessSummary(
            String mode,
            String summary) {
    }

    public record AppsSummary(
            int installed,
            int running,
            int needsAttention,
            List<ReadyAppSummary> readyToOpen) {
    }

    public record BackupSummary(
            String state,
            String summary) {
    }

    public record DockerSummary(
            boolean ready,
            String summary) {
    }

    public record ReadyAppSummary(
            String appInstanceId,
            String name,
            String url) {
    }

    public record StorageSummary(
            String state,
            String summary) {
    }

    public record SystemSummary(
            String deviceName,
            String instanceId,
            String lanUrl,
            SetupProgressModels.SetupProgressSummary setup,
            DockerSummary docker,
            AccessSummary access,
            AppsSummary apps,
            BackupSummary backups,
            StorageSummary storage,
            List<AutarkOsIssue> issues,
            Instant updatedAt) {
    }
}
