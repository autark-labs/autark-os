package com.autarkos.system;

import java.time.Instant;

/** Public, redacted model for the bounded browser-driven core-update flow. */
public final class CoreUpdateModels {

    private CoreUpdateModels() {
    }

    public record Candidate(
            String bundleId,
            String identity,
            String version,
            String architecture) {
    }

    public record Status(
            String schemaVersion,
            String status,
            boolean helperAvailable,
            boolean repairAvailable,
            String message,
            Candidate candidate,
            String jobId,
            Instant updatedAt) {
    }

    public record ApplyRequest(
            String bundleId,
            String candidateIdentity,
            String confirmation) {
    }
}
