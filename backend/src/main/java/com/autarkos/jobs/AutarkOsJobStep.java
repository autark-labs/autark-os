package com.autarkos.jobs;

import java.time.Instant;

public record AutarkOsJobStep(
        String id,
        String label,
        String status,
        String message,
        Instant startedAt,
        Instant finishedAt) {

    public static AutarkOsJobStep pending(String id, String label) {
        return new AutarkOsJobStep(id, label, "pending", "", null, null);
    }

    public static AutarkOsJobStep running(String id, String label, String message) {
        return new AutarkOsJobStep(id, label, "running", message == null ? "" : message, Instant.now(), null);
    }

    public static AutarkOsJobStep succeeded(String id, String label, String message) {
        return new AutarkOsJobStep(id, label, "succeeded", message == null ? "" : message, null, Instant.now());
    }

    public static AutarkOsJobStep failed(String id, String label, String message) {
        return new AutarkOsJobStep(id, label, "failed", message == null ? "" : message, null, Instant.now());
    }

    AutarkOsJobStep withStatus(String nextStatus, String nextMessage, Instant startedAt, Instant finishedAt) {
        return new AutarkOsJobStep(
                id,
                label,
                nextStatus,
                nextMessage == null || nextMessage.isBlank() ? message : nextMessage,
                startedAt == null ? this.startedAt : startedAt,
                finishedAt == null ? this.finishedAt : finishedAt);
    }
}
