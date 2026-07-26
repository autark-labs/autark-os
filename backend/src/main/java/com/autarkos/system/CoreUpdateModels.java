package com.autarkos.system;

import java.time.Instant;

/** Public, redacted model for the managed appliance-update flow. */
public final class CoreUpdateModels {

    private CoreUpdateModels() {
    }

    public record Candidate(
            String bundleId,
            String identity,
            String version,
            String architecture) {
    }

    public record AvailableRelease(
            String version,
            String channel,
            String releaseNotesUrl) {
    }

    public record Status(
            String schemaVersion,
            String status,
            boolean helperAvailable,
            boolean repairAvailable,
            String message,
            String installedVersion,
            String channel,
            AvailableRelease availableRelease,
            Candidate candidate,
            String jobId,
            Instant updatedAt) {
    }

    public record ApplyRequest(
            String version) {
    }
}
