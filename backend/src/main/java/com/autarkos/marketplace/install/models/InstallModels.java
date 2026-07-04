package com.autarkos.marketplace.install.models;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.models.GuideModels.AppSetupGuide;
import com.autarkos.marketplace.install.models.GuideModels.PostInstallGuide;
import com.autarkos.marketplace.plan.InstallPlan;

public final class InstallModels {

    private InstallModels() {
    }

    public record AppSettingsChangePlan(
            String appId,
            String appName,
            String impact,
            String headline,
            String summary,
            boolean saveAllowed,
            boolean redeployRequired,
            boolean restartRequired,
            boolean dataMigrationRequired,
            List<String> changes,
            List<String> warnings,
            List<String> blockedReasons) {
    }

    public record BackupPolicy(
            boolean enabled,
            String frequency,
            int retention) {

        public static BackupPolicy defaults() {
            return new BackupPolicy(true, "daily", 7);
        }

        public String label() {
            if (!enabled) {
                return "Disabled";
            }
            return frequency + ", keep " + retention;
        }
    }

    public record InstallResult(
            String appId,
            String appName,
            String status,
            String message,
            String accessUrl,
            InstallPlan plan,
            List<InstallStep> steps,
            List<String> logs,
            GuideModels.PostInstallGuide postInstallGuide,
            GuideModels.AppSetupGuide setupGuide) {
    }

    public record InstallSettings(
            String accessUrl,
            String privateAccessUrl,
            boolean tailscaleEnabled,
            Map<String, String> storageSubfolders,
            BackupPolicy backup,
            String desiredAccessMode,
            String privateAccessRequirement,
            Integer expectedLocalPort,
            String expectedProtocol,
            Instant lastAccessCheckAt,
            Instant lastSuccessfulAccessAt,
            Instant lastRepairAttemptAt,
            String lastRepairStatus,
            boolean autoRepairEnabled) {

        public InstallSettings(String accessUrl, String privateAccessUrl, boolean tailscaleEnabled, Map<String, String> storageSubfolders, BackupPolicy backup) {
            this(accessUrl, privateAccessUrl, tailscaleEnabled, storageSubfolders, backup, null, null, null, null, null, null, null, null, true);
        }

        public static InstallSettings defaults(String accessUrl) {
            return new InstallSettings(accessUrl, null, false, Map.of(), BackupPolicy.defaults(), "local", "optional", null, "http", null, null, null, null, true);
        }
    }

    public record InstallStep(String label, String status, String detail, Instant timestamp) {
        public static InstallStep completed(String label, String detail) {
            return new InstallStep(label, AutarkOsStates.JobStatus.COMPLETED, detail, Instant.now());
        }

        public static InstallStep failed(String label, String detail) {
            return new InstallStep(label, AutarkOsStates.JobStatus.FAILED, detail, Instant.now());
        }

        public static InstallStep warning(String label, String detail) {
            return new InstallStep(label, AutarkOsStates.Tone.WARNING, detail, Instant.now());
        }
    }

    public record UninstallPlan(
            String appId,
            String appName,
            String headline,
            boolean safetyCheckpointPlanned,
            String safetyCheckpointMessage,
            List<String> willStop,
            List<String> willKeep,
            List<String> needsConfirmation) {
    }
}
