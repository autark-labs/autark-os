package com.autarkos.jobs;

import java.time.Instant;
import java.util.List;

public record AutarkOsJob(
        String jobId,
        String type,
        String subjectId,
        String status,
        String currentStep,
        List<AutarkOsJobStep> steps,
        Instant createdAt,
        Instant updatedAt,
        AutarkOsJobError error) {
}
