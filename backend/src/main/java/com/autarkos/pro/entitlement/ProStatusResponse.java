package com.autarkos.pro.entitlement;

import java.time.Instant;
import java.util.UUID;

import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.model.ProModuleState;

public record ProStatusResponse(
        String schemaVersion,
        ProEntitlementStatus entitlement,
        DeviceStatus device,
        ActivationStatus activation,
        ModuleStatus module,
        RefreshStatus refresh) {

    public record DeviceStatus(
            String deviceId,
            String installationId,
            String publicKeyFingerprint,
            boolean registered) {
    }

    public record ActivationStatus(
            String state,
            UUID activationId,
            Instant expiresAt) {
    }

    public record ModuleStatus(
            ProModuleState state,
            String componentVersion,
            String activeDigest,
            String previousDigest,
            String health,
            String jobId,
            String errorCode) {
    }

    public record RefreshStatus(
            boolean inProgress,
            Instant lastAttemptAt,
            Instant lastSuccessAt,
            Instant nextAttemptAt,
            String lastFailureCategory,
            int consecutiveFailures) {
    }
}
