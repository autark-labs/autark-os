package com.autarkos.pro.model;

import java.time.Instant;
import java.util.List;

public record NormalizedHostSnapshot(
        String schemaVersion,
        String snapshotId,
        Instant generatedAt,
        SystemSnapshot system,
        List<AppSnapshot> apps,
        FoundServicesSnapshot foundServices,
        List<AccessSnapshot> access,
        BackupSnapshot backups,
        StorageSnapshot storage,
        MetricsSnapshot metrics,
        List<ConfigurationSnapshot> configuration,
        List<MutationSnapshot> recentMutations,
        List<EventSnapshot> recentEvents,
        boolean partial) {

    public record SystemSnapshot(
            String coreVersion,
            String architecture,
            String hostReadiness,
            String tailscaleReadiness) {
    }

    public record AppSnapshot(
            String resourceRef,
            String displayName,
            String lifecycleState,
            String readiness,
            Boolean updateAvailable,
            int recentFailureCount,
            int repairCount,
            String jobConflict) {
    }

    public record FoundServicesSnapshot(
            int found,
            int pinned,
            int recoverable,
            int blocked,
            List<String> conflictCategories) {
    }

    public record AccessSnapshot(
            String resourceRef,
            String intent,
            String reachability,
            String mappingState) {
    }

    public record BackupSnapshot(
            String availability,
            BackupDestinationSnapshot destination,
            List<AppBackupSnapshot> apps) {
    }

    public record BackupDestinationSnapshot(
            String destinationRef,
            String availability) {
    }

    public record AppBackupSnapshot(
            String resourceRef,
            String coverage,
            String scheduleState,
            String scheduleFrequency,
            Instant lastRestorePointAt,
            Instant lastVerificationAt,
            String lastVerificationResult,
            int recentFailureCount,
            String operationState,
            String restoreEvidence,
            Instant lastSuccessfulRestoreAt,
            Integer retainedRestorePointCount) {
    }

    public record StorageSnapshot(
            String availability,
            Long totalBytes,
            Long usedBytes,
            Long appDataBytes,
            Long backupTotalBytes,
            Long backupVolumeUsedBytes,
            Long backupUsedBytes,
            List<AppStorageSnapshot> apps,
            Long orphanBytes) {
    }

    public record AppStorageSnapshot(
            String resourceRef,
            Long usedBytes) {
    }

    public record MetricsSnapshot(
            String availability,
            Double cpuPercent,
            Double memoryUsedPercent,
            Double diskUsedPercent) {
    }

    public record ConfigurationSnapshot(
            String fieldId,
            String resourceRef,
            String value) {
    }

    public record MutationSnapshot(
            String method,
            String path,
            Instant observedAt,
            String correlationId) {
    }

    public record EventSnapshot(
            String category,
            String outcome,
            Instant observedAt,
            String correlationId,
            String resourceRef) {
    }
}
