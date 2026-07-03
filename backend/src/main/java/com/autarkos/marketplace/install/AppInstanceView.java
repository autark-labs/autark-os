package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;

import com.autarkos.api.ApplicationBehaviorStates;
import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;

public record AppInstanceView(
        String appInstanceId,
        String catalogAppId,
        String name,
        String category,
        String icon,
        String userStatus,
        String managementState,
        String readinessState,
        String attentionState,
        String installState,
        String runtimeState,
        String ownershipState,
        String accessState,
        String backupState,
        String localUrl,
        String privateUrl,
        List<AutarkOsIssue> issues,
        List<AutarkOsAction> actions,
        AppRemediationView remediation,
        Instant updatedAt) {

    public AppInstanceView(
            String appInstanceId,
            String catalogAppId,
            String name,
            String category,
            String icon,
            String userStatus,
            String installState,
            String runtimeState,
            String ownershipState,
            String accessState,
            String backupState,
            String localUrl,
            String privateUrl,
            List<AutarkOsIssue> issues,
            List<AutarkOsAction> actions,
            AppRemediationView remediation,
            Instant updatedAt) {
        this(
                appInstanceId,
                catalogAppId,
                name,
                category,
                icon,
                userStatus,
                ApplicationBehaviorStates.managedManagementState(),
                ApplicationBehaviorStates.managedReadinessState(userStatus),
                ApplicationBehaviorStates.managedAttentionState(userStatus),
                installState,
                runtimeState,
                ownershipState,
                accessState,
                backupState,
                localUrl,
                privateUrl,
                issues,
                actions,
                remediation,
                updatedAt);
    }

    public AppInstanceView(
            String appInstanceId,
            String catalogAppId,
            String name,
            String category,
            String icon,
            String userStatus,
            String installState,
            String runtimeState,
            String ownershipState,
            String accessState,
            String backupState,
            String localUrl,
            String privateUrl,
            List<AutarkOsIssue> issues,
            List<AutarkOsAction> actions,
            Instant updatedAt) {
        this(
                appInstanceId,
                catalogAppId,
                name,
                category,
                icon,
                userStatus,
                ApplicationBehaviorStates.managedManagementState(),
                ApplicationBehaviorStates.managedReadinessState(userStatus),
                ApplicationBehaviorStates.managedAttentionState(userStatus),
                installState,
                runtimeState,
                ownershipState,
                accessState,
                backupState,
                localUrl,
                privateUrl,
                issues,
                actions,
                new AppRemediationView("healthy", "Ready", name + " is ready to use.", "No action needed", "success"),
                updatedAt);
    }
}
