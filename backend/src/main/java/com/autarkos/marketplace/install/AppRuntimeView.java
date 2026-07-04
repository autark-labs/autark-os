package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;

import com.autarkos.api.AppOperationView;
import com.autarkos.api.ApplicationBehaviorStates;
import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.marketplace.install.models.GuideModels;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.ReliabilityModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ConfigurationItem;

public record AppRuntimeView(
        String appId,
        String appName,
        String category,
        String description,
        String version,
        String image,
        String friendlyStatus,
        String managementState,
        String readinessState,
        String attentionState,
        AppOperationView operationState,
        String sortKey,
        int displayOrder,
        List<AutarkOsAction> availableActions,
        String technicalStatus,
        String healthCheck,
        String runtimePath,
        String composeProject,
        String accessUrl,
        AccessModels.AppAccessRoute accessRoute,
        AccessModels.AccessDesiredState desiredAccess,
        AccessModels.AccessObservedState observedAccess,
        Instant installedAt,
        String lastBackup,
        String canonicalBackupState,
        InstallModels.InstallSettings settings,
        RuntimeModels.AppTelemetry telemetry,
        AppHealthSnapshot healthSnapshot,
        GuideModels.PostInstallGuide usageGuide,
        GuideModels.AppSetupGuide setupGuide,
        List<ConfigurationItem> appConfiguration,
        ReliabilityModels.AppRemediationView remediation,
        List<AppEvent> recentEvents) {

    public AppRuntimeView(
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
            AccessModels.AppAccessRoute accessRoute,
            AccessModels.AccessDesiredState desiredAccess,
            AccessModels.AccessObservedState observedAccess,
            Instant installedAt,
            String lastBackup,
            String canonicalBackupState,
            InstallModels.InstallSettings settings,
            RuntimeModels.AppTelemetry telemetry,
            AppHealthSnapshot healthSnapshot,
            GuideModels.PostInstallGuide usageGuide,
            GuideModels.AppSetupGuide setupGuide,
            List<ConfigurationItem> appConfiguration,
            ReliabilityModels.AppRemediationView remediation,
            List<AppEvent> recentEvents) {
        this(
                appId,
                appName,
                category,
                description,
                version,
                image,
                friendlyStatus,
                ApplicationBehaviorStates.managedManagementState(),
                ApplicationBehaviorStates.managedReadinessState(friendlyStatus),
                ApplicationBehaviorStates.managedAttentionState(friendlyStatus),
                AppOperationView.idle(),
                "managed:" + appId,
                0,
                defaultAvailableActions(appId, friendlyStatus),
                technicalStatus,
                healthCheck,
                runtimePath,
                composeProject,
                accessUrl,
                accessRoute,
                desiredAccess,
                observedAccess,
                installedAt,
                lastBackup,
                canonicalBackupState == null || canonicalBackupState.isBlank() ? backupStateFromSettings(settings) : canonicalBackupState,
                settings,
                telemetry,
                healthSnapshot,
                usageGuide,
                setupGuide,
                appConfiguration,
                remediation,
                recentEvents);
    }

    public AppRuntimeView(
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
            AccessModels.AppAccessRoute accessRoute,
            AccessModels.AccessDesiredState desiredAccess,
            AccessModels.AccessObservedState observedAccess,
            Instant installedAt,
            String lastBackup,
            InstallModels.InstallSettings settings,
            RuntimeModels.AppTelemetry telemetry,
            AppHealthSnapshot healthSnapshot,
            GuideModels.PostInstallGuide usageGuide,
            GuideModels.AppSetupGuide setupGuide,
            List<ConfigurationItem> appConfiguration,
            List<AppEvent> recentEvents) {
        this(
                appId,
                appName,
                category,
                description,
                version,
                image,
                friendlyStatus,
                ApplicationBehaviorStates.managedManagementState(),
                ApplicationBehaviorStates.managedReadinessState(friendlyStatus),
                ApplicationBehaviorStates.managedAttentionState(friendlyStatus),
                AppOperationView.idle(),
                "managed:" + appId,
                0,
                defaultAvailableActions(appId, friendlyStatus),
                technicalStatus,
                healthCheck,
                runtimePath,
                composeProject,
                accessUrl,
                accessRoute,
                desiredAccess,
                observedAccess,
                installedAt,
                lastBackup,
                backupStateFromSettings(settings),
                settings,
                telemetry,
                healthSnapshot,
                usageGuide,
                setupGuide,
                appConfiguration,
                AppRemediationPolicy.remediation(appName, friendlyStatus, settings == null ? null : settings.lastRepairStatus(), settings == null || settings.autoRepairEnabled(), false, false),
                recentEvents);
    }

    public AppRuntimeView withSurfaceState(AppOperationView operationState, String sortKey, int displayOrder, List<AutarkOsAction> availableActions) {
        String nextReadinessState = operationReadinessState(operationState, readinessState);
        String nextFriendlyStatus = operationFriendlyStatus(operationState, friendlyStatus);
        return new AppRuntimeView(
                appId,
                appName,
                category,
                description,
                version,
                image,
                nextFriendlyStatus,
                managementState,
                nextReadinessState,
                attentionState,
                operationState == null ? AppOperationView.idle() : operationState,
                sortKey == null || sortKey.isBlank() ? "managed:" + appId : sortKey,
                displayOrder,
                availableActions == null ? List.of() : availableActions,
                technicalStatus,
                healthCheck,
                runtimePath,
                composeProject,
                accessUrl,
                accessRoute,
                desiredAccess,
                observedAccess,
                installedAt,
                lastBackup,
                canonicalBackupState,
                settings,
                telemetry,
                healthSnapshot,
                usageGuide,
                setupGuide,
                appConfiguration,
                remediation,
                recentEvents);
    }

    private static String operationReadinessState(AppOperationView operationState, String current) {
        if (operationState == null || AutarkOsStates.OperationKind.IDLE.equals(operationState.kind())) {
            return current;
        }
        return switch (operationState.kind()) {
            case AutarkOsStates.OperationKind.STARTING, AutarkOsStates.OperationKind.RESTARTING -> AutarkOsStates.ReadinessState.STARTING;
            case AutarkOsStates.OperationKind.STOPPING -> AutarkOsStates.ReadinessState.PAUSED;
            case AutarkOsStates.OperationKind.UNINSTALLING -> AutarkOsStates.ReadinessState.UNKNOWN;
            default -> current;
        };
    }

    private static String operationFriendlyStatus(AppOperationView operationState, String current) {
        if (operationState == null || AutarkOsStates.OperationKind.IDLE.equals(operationState.kind())) {
            return current;
        }
        return switch (operationState.kind()) {
            case AutarkOsStates.OperationKind.STARTING, AutarkOsStates.OperationKind.RESTARTING -> AutarkOsStates.AppStatus.STARTING;
            case AutarkOsStates.OperationKind.STOPPING -> AutarkOsStates.AppStatus.PAUSED;
            default -> current;
        };
    }

    private static List<AutarkOsAction> defaultAvailableActions(String appId, String friendlyStatus) {
        if (appId == null || appId.isBlank()) {
            return List.of();
        }
        boolean paused = AutarkOsStates.AppStatus.STOPPED.equals(friendlyStatus) || AutarkOsStates.AppStatus.PAUSED.equals(friendlyStatus);
        return paused
                ? List.of(
                        AutarkOsAction.post("start", "Start", "/api/apps/" + appId + "/start", false, false),
                        AutarkOsAction.post("restart", "Restart", "/api/apps/" + appId + "/restart", false, false))
                : List.of(
                        AutarkOsAction.post("stop", "Pause", "/api/apps/" + appId + "/stop", false, false),
                        AutarkOsAction.post("restart", "Restart", "/api/apps/" + appId + "/restart", false, false));
    }

    private static String backupStateFromSettings(InstallModels.InstallSettings settings) {
        if (settings == null || settings.backup() == null || !settings.backup().enabled()) {
            return AutarkOsStates.BackupState.DISABLED;
        }
        return AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT;
    }
}
