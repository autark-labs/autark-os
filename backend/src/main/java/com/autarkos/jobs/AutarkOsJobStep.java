package com.autarkos.jobs;

import java.time.Instant;

import com.autarkos.api.AutarkOsStates;

public record AutarkOsJobStep(
        String id,
        String label,
        String status,
        String message,
        Instant startedAt,
        Instant finishedAt,
        Recovery recovery) {

    public record Recovery(String appId, String appInstanceId, boolean resumeAllowed) { }

    public AutarkOsJobStep(String id, String label, String status, String message, Instant startedAt, Instant finishedAt) {
        this(id, label, status, message, startedAt, finishedAt, null);
    }

    public static AutarkOsJobStep pending(String id, String label) {
        return new AutarkOsJobStep(id, label, AutarkOsStates.JobStatus.PENDING, "", null, null);
    }

    public static AutarkOsJobStep running(String id, String label, String message) {
        return new AutarkOsJobStep(id, label, AutarkOsStates.JobStatus.RUNNING, message == null ? "" : message, Instant.now(), null);
    }

    public static AutarkOsJobStep succeeded(String id, String label, String message) {
        return new AutarkOsJobStep(id, label, AutarkOsStates.JobStatus.SUCCEEDED, message == null ? "" : message, null, Instant.now());
    }

    public static AutarkOsJobStep failed(String id, String label, String message) {
        return new AutarkOsJobStep(id, label, AutarkOsStates.JobStatus.FAILED, message == null ? "" : message, null, Instant.now());
    }

    AutarkOsJobStep withStatus(String nextStatus, String nextMessage, Instant startedAt, Instant finishedAt) {
        return new AutarkOsJobStep(
                id,
                label,
                nextStatus,
                nextMessage == null || nextMessage.isBlank() ? message : nextMessage,
                startedAt == null ? this.startedAt : startedAt,
                finishedAt == null ? this.finishedAt : finishedAt,
                recovery);
    }
}
