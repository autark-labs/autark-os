package com.autarkos.backups;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;

/** Records actual execution phases in the existing durable job, including recovery. */
final class BackupJobs {
    private final AutarkOsJobService jobs;

    BackupJobs(AutarkOsJobService jobs) {
        this.jobs = jobs;
    }

    static List<AutarkOsJobStep> steps() {
        return List.of(AutarkOsJobStep.pending("prepare_backup", "Validating backup scope and storage"));
    }

    void start(String id, String label) {
        write(id, label, "running", "");
    }

    void complete(String id, String message) {
        write(id, null, "succeeded", message);
    }

    void fail(String message) {
        current().stream().filter(step -> "running".equals(step.status()) && step.recovery() == null)
                .forEach(step -> write(step.id(), step.label(), "failed", message));
    }

    private void write(String id, String label, String status, String message) {
        String jobId = jobs.executingJobId();
        if (jobId == null) return; // Internal checkpoints have no separate owner-facing job.
        var steps = new ArrayList<>(current());
        var previous = steps.stream().filter(step -> step.id().equals(id)).findFirst().orElse(null);
        Instant now = Instant.now();
        var updated = new AutarkOsJobStep(id, label == null && previous != null ? previous.label() : label,
                status, message, previous == null || previous.startedAt() == null ? now : previous.startedAt(),
                "running".equals(status) ? null : now);
        if (previous == null) steps.add(updated);
        else steps.set(steps.indexOf(previous), updated);
        jobs.recordProgress(jobId, steps);
    }

    List<AutarkOsJobStep> current() {
        String jobId = jobs.executingJobId();
        return jobId == null ? List.of() : jobs.findById(jobId).orElseThrow().steps();
    }

    static AutarkOsJobOutcome outcome(BackupModels.BackupRunResult result, AutarkOsJobService jobs) {
        return outcome(result.status(), result.message(), jobs);
    }

    static AutarkOsJobOutcome outcome(String status, String message, AutarkOsJobService jobs) {
        BackupJobs progress = new BackupJobs(jobs);
        boolean failed = "failed".equals(status) || "warning".equals(status) || "legacy_unverified".equals(status);
        if (failed) progress.fail(message);
        else progress.current().stream().filter(step -> "running".equals(step.status()) && step.recovery() == null)
                .forEach(step -> progress.complete(step.id(), message));
        // Never manufacture successful copy/verification steps from a terminal result.
        return failed ? AutarkOsJobOutcome.failed(message, progress.current())
                : AutarkOsJobOutcome.succeeded(message, progress.current());
    }
}
