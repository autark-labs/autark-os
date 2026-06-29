package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.List;

import com.projectos.api.AppOperationView;
import com.projectos.api.ApplicationBehaviorStates;
import com.projectos.api.ProjectOsAction;
import com.projectos.marketplace.model.ConfigurationItem;

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
        List<ProjectOsAction> availableActions,
        String technicalStatus,
        String healthCheck,
        String runtimePath,
        String composeProject,
        String accessUrl,
        AppAccessRoute accessRoute,
        AccessDesiredState desiredAccess,
        AccessObservedState observedAccess,
        Instant installedAt,
        String lastBackup,
        InstallSettings settings,
        AppTelemetry telemetry,
        AppHealthSnapshot healthSnapshot,
        PostInstallGuide usageGuide,
        AppSetupGuide setupGuide,
        List<ConfigurationItem> appConfiguration,
        AppRemediationView remediation,
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
            AppAccessRoute accessRoute,
            AccessDesiredState desiredAccess,
            AccessObservedState observedAccess,
            Instant installedAt,
            String lastBackup,
            InstallSettings settings,
            AppTelemetry telemetry,
            AppHealthSnapshot healthSnapshot,
            PostInstallGuide usageGuide,
            AppSetupGuide setupGuide,
            List<ConfigurationItem> appConfiguration,
            AppRemediationView remediation,
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
            AppAccessRoute accessRoute,
            AccessDesiredState desiredAccess,
            AccessObservedState observedAccess,
            Instant installedAt,
            String lastBackup,
            InstallSettings settings,
            AppTelemetry telemetry,
            AppHealthSnapshot healthSnapshot,
            PostInstallGuide usageGuide,
            AppSetupGuide setupGuide,
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
                settings,
                telemetry,
                healthSnapshot,
                usageGuide,
                setupGuide,
                appConfiguration,
                AppRemediationPolicy.remediation(appName, friendlyStatus, settings == null ? null : settings.lastRepairStatus(), settings == null || settings.autoRepairEnabled(), false, false),
                recentEvents);
    }

    public AppRuntimeView withSurfaceState(AppOperationView operationState, String sortKey, int displayOrder, List<ProjectOsAction> availableActions) {
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
        if (operationState == null || "idle".equals(operationState.kind())) {
            return current;
        }
        return switch (operationState.kind()) {
            case "starting", "restarting" -> "starting";
            case "stopping" -> "paused";
            case "uninstalling" -> "unknown";
            default -> current;
        };
    }

    private static String operationFriendlyStatus(AppOperationView operationState, String current) {
        if (operationState == null || "idle".equals(operationState.kind())) {
            return current;
        }
        return switch (operationState.kind()) {
            case "starting", "restarting" -> "Starting";
            case "stopping" -> "Paused";
            default -> current;
        };
    }

    private static List<ProjectOsAction> defaultAvailableActions(String appId, String friendlyStatus) {
        if (appId == null || appId.isBlank()) {
            return List.of();
        }
        boolean paused = "Stopped".equals(friendlyStatus) || "Paused".equals(friendlyStatus);
        return paused
                ? List.of(
                        ProjectOsAction.post("start", "Start", "/api/apps/" + appId + "/start", false, false),
                        ProjectOsAction.post("restart", "Restart", "/api/apps/" + appId + "/restart", false, false))
                : List.of(
                        ProjectOsAction.post("stop", "Pause", "/api/apps/" + appId + "/stop", false, false),
                        ProjectOsAction.post("restart", "Restart", "/api/apps/" + appId + "/restart", false, false));
    }
}
