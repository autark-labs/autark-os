package com.autarkos.discover;

import java.util.List;
import java.util.Map;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.discover.DiscoverSetupModels.DiscoverSetupAnswersRequest;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.install.InstallModels;
import com.autarkos.marketplace.plan.InstallPlan;

public final class DiscoverInstallModels {

    private DiscoverInstallModels() {
    }

    public record DiscoverInstallIssue(
            String fieldId,
            String severity,
            String message) {
    }

    public record DiscoverInstallPreview(
            boolean valid,
            List<DiscoverInstallIssue> blockingIssues,
            List<DiscoverInstallIssue> warnings,
            List<DiscoverInstallPreviewSection> sections,
            InstallPlan technicalDetails,
            InstallOptionsRequest installOptions) {
    }

    public record DiscoverInstallPreviewItem(
            String label,
            String description,
            String tone) {
    }

    public record DiscoverInstallPreviewSection(
            String id,
            String title,
            List<DiscoverInstallPreviewItem> items) {
    }

    public record DiscoverInstallRequest(
            Map<String, Object> answers,
            Boolean reinstall,
            Boolean duplicateAcknowledged) {

        public DiscoverInstallRequest(Map<String, Object> answers, Boolean reinstall) {
            this(answers, reinstall, false);
        }

        public DiscoverSetupAnswersRequest answersRequest() {
            return new DiscoverSetupAnswersRequest(answers);
        }

        public boolean reinstallRequested() {
            return Boolean.TRUE.equals(reinstall);
        }

        public boolean duplicateAcknowledgedRequested() {
            return Boolean.TRUE.equals(duplicateAcknowledged);
        }
    }

    public record DiscoverInstalledAppSummary(
            String appId,
            String appName,
            String status,
            String accessUrl,
            String backupState,
            boolean protectedByBackups,
            boolean firstBackupRecommended) {

        public DiscoverInstalledAppSummary(String appId, String appName, String status, String accessUrl) {
            this(appId, appName, status, accessUrl, AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT, false, true);
        }
    }
}
