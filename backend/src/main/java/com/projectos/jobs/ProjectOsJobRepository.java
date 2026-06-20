package com.projectos.jobs;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.projectos.database.DatabaseBackedRepository;
import com.projectos.database.ProjectOsDatabase;
import com.projectos.marketplace.install.InstallationException;
import com.projectos.marketplace.runtime.RuntimeLayout;

@Repository
public class ProjectOsJobRepository extends DatabaseBackedRepository {

    private final Supplier<Instant> clock;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public ProjectOsJobRepository(ProjectOsDatabase database) {
        this(database, Instant::now);
    }

    public ProjectOsJobRepository(RuntimeLayout runtimeLayout, Supplier<Instant> clock) {
        this(new ProjectOsDatabase(runtimeLayout), clock);
    }

    ProjectOsJobRepository(ProjectOsDatabase database, Supplier<Instant> clock) {
        super(database);
        this.clock = clock;
    }

    public ProjectOsJob create(String type, String subjectId, List<ProjectOsJobStep> steps) {
        migrate();
        Instant now = clock.get();
        String jobId = "job_" + UUID.randomUUID().toString().replace("-", "");
        String currentStep = steps == null || steps.isEmpty() ? "" : steps.getFirst().id();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                insert into project_os_jobs(job_id, job_type, subject_id, status, current_step, steps_json, error_details_json, created_at, updated_at)
                values(?, ?, ?, 'queued', ?, ?, '{}', ?, ?)
                """)) {
            statement.setString(1, jobId);
            statement.setString(2, clean(type, "job"));
            statement.setString(3, blankToNull(subjectId));
            statement.setString(4, currentStep);
            statement.setString(5, stepsJson(steps == null ? List.of() : steps));
            statement.setString(6, now.toString());
            statement.setString(7, now.toString());
            statement.executeUpdate();
            return findById(jobId).orElseThrow();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to create Project OS job.", exception);
        }
    }

    public Optional<ProjectOsJob> activeFor(String type, String subjectId) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                select * from project_os_jobs
                where job_type = ?
                  and coalesce(subject_id, '') = coalesce(?, '')
                  and status in ('queued', 'running')
                order by created_at asc
                limit 1
                """)) {
            statement.setString(1, clean(type, "job"));
            statement.setString(2, blankToNull(subjectId));
            ResultSet resultSet = statement.executeQuery();
            return resultSet.next() ? Optional.of(job(resultSet)) : Optional.empty();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read active Project OS job.", exception);
        }
    }

    public Optional<ProjectOsJob> findById(String jobId) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from project_os_jobs where job_id = ?")) {
            statement.setString(1, jobId);
            ResultSet resultSet = statement.executeQuery();
            return resultSet.next() ? Optional.of(job(resultSet)) : Optional.empty();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read Project OS job.", exception);
        }
    }

    public List<ProjectOsJob> list(int limit) {
        migrate();
        int safeLimit = Math.max(1, Math.min(limit, 200));
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from project_os_jobs order by updated_at desc, created_at desc limit ?")) {
            statement.setInt(1, safeLimit);
            ResultSet resultSet = statement.executeQuery();
            List<ProjectOsJob> jobs = new ArrayList<>();
            while (resultSet.next()) {
                jobs.add(job(resultSet));
            }
            return jobs;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to list Project OS jobs.", exception);
        }
    }

    public List<ProjectOsJob> activeJobs() {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                select * from project_os_jobs
                where status in ('queued', 'running')
                order by created_at asc
                """)) {
            ResultSet resultSet = statement.executeQuery();
            List<ProjectOsJob> jobs = new ArrayList<>();
            while (resultSet.next()) {
                jobs.add(job(resultSet));
            }
            return jobs;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to list active Project OS jobs.", exception);
        }
    }

    public ProjectOsJob markRunning(String jobId, String stepId) {
        return update(jobId, "running", stepId, markStep(jobId, stepId, "running", "Started.", true), null, null, Map.of());
    }

    public ProjectOsJob recordProgress(String jobId, List<ProjectOsJobStep> steps) {
        String currentStep = steps == null || steps.isEmpty() ? currentStep(jobId) : steps.getLast().id();
        return update(jobId, "running", currentStep, steps == null ? List.of() : steps, null, null, Map.of());
    }

    public ProjectOsJob completeStep(String jobId, String stepId, String message) {
        return update(jobId, null, stepId, markStep(jobId, stepId, "succeeded", message, false), null, null, Map.of());
    }

    public ProjectOsJob succeed(String jobId, String message, List<ProjectOsJobStep> steps) {
        List<ProjectOsJobStep> nextSteps = steps == null || steps.isEmpty() ? markAllPending(jobId, "succeeded", message) : steps;
        String currentStep = nextSteps.isEmpty() ? "" : nextSteps.getLast().id();
        return update(jobId, "succeeded", currentStep, nextSteps, null, null, Map.of());
    }

    public ProjectOsJob fail(String jobId, String code, String message, Map<String, String> details) {
        return update(jobId, "failed", currentStep(jobId), markRunningStepFailed(jobId, message), clean(code, "job_failed"), clean(message, "Job failed."), details == null ? Map.of() : details);
    }

    public ProjectOsJob cancel(String jobId) {
        return update(jobId, "cancelled", currentStep(jobId), findById(jobId).orElseThrow().steps(), null, null, Map.of());
    }

    private ProjectOsJob update(String jobId, String status, String currentStep, List<ProjectOsJobStep> steps, String errorCode, String errorMessage, Map<String, String> errorDetails) {
        migrate();
        Instant now = clock.get();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                update project_os_jobs
                set status = coalesce(?, status),
                    current_step = coalesce(?, current_step),
                    steps_json = ?,
                    error_code = ?,
                    error_message = ?,
                    error_details_json = ?,
                    updated_at = ?
                where job_id = ?
                """)) {
            statement.setString(1, status);
            statement.setString(2, currentStep == null || currentStep.isBlank() ? null : currentStep);
            statement.setString(3, stepsJson(steps));
            statement.setString(4, errorCode);
            statement.setString(5, errorMessage);
            statement.setString(6, errorDetailsJson(errorDetails));
            statement.setString(7, now.toString());
            statement.setString(8, jobId);
            statement.executeUpdate();
            return findById(jobId).orElseThrow();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to update Project OS job.", exception);
        }
    }

    private List<ProjectOsJobStep> markStep(String jobId, String stepId, String status, String message, boolean started) {
        Instant now = clock.get();
        return findById(jobId).orElseThrow().steps().stream()
                .map(step -> step.id().equals(stepId) ? step.withStatus(status, message, started ? now : null, "succeeded".equals(status) || "failed".equals(status) ? now : null) : step)
                .toList();
    }

    private List<ProjectOsJobStep> markAllPending(String jobId, String status, String message) {
        Instant now = clock.get();
        return findById(jobId).orElseThrow().steps().stream()
                .map(step -> "pending".equals(step.status()) ? step.withStatus(status, message, null, now) : step)
                .toList();
    }

    private List<ProjectOsJobStep> markRunningStepFailed(String jobId, String message) {
        Instant now = clock.get();
        return findById(jobId).orElseThrow().steps().stream()
                .map(step -> "running".equals(step.status()) ? step.withStatus("failed", message, null, now) : step)
                .toList();
    }

    private String currentStep(String jobId) {
        return findById(jobId).map(ProjectOsJob::currentStep).orElse("");
    }

    private ProjectOsJob job(ResultSet resultSet) throws SQLException {
        String errorCode = resultSet.getString("error_code");
        ProjectOsJobError error = errorCode == null || errorCode.isBlank()
                ? null
                : new ProjectOsJobError(errorCode, resultSet.getString("error_message"), errorDetails(resultSet.getString("error_details_json")));
        return new ProjectOsJob(
                resultSet.getString("job_id"),
                resultSet.getString("job_type"),
                resultSet.getString("subject_id"),
                resultSet.getString("status"),
                resultSet.getString("current_step"),
                steps(resultSet.getString("steps_json")),
                Instant.parse(resultSet.getString("created_at")),
                Instant.parse(resultSet.getString("updated_at")),
                error);
    }

    private String stepsJson(List<ProjectOsJobStep> steps) {
        List<Map<String, String>> values = steps.stream()
                .map(step -> Map.of(
                        "id", clean(step.id(), ""),
                        "label", clean(step.label(), ""),
                        "status", clean(step.status(), "pending"),
                        "message", clean(step.message(), ""),
                        "startedAt", step.startedAt() == null ? "" : step.startedAt().toString(),
                        "finishedAt", step.finishedAt() == null ? "" : step.finishedAt().toString()))
                .toList();
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to serialize Project OS job steps.", exception);
        }
    }

    private List<ProjectOsJobStep> steps(String json) {
        try {
            List<Map<String, String>> values = objectMapper.readValue(json == null || json.isBlank() ? "[]" : json, new TypeReference<>() {});
            return values.stream()
                    .map(value -> new ProjectOsJobStep(
                            value.getOrDefault("id", ""),
                            value.getOrDefault("label", ""),
                            value.getOrDefault("status", "pending"),
                            value.getOrDefault("message", ""),
                            instant(value.get("startedAt")),
                            instant(value.get("finishedAt"))))
                    .toList();
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to read Project OS job steps.", exception);
        }
    }

    private String errorDetailsJson(Map<String, String> details) {
        try {
            return objectMapper.writeValueAsString(details == null ? Map.of() : details);
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to serialize Project OS job error details.", exception);
        }
    }

    private Map<String, String> errorDetails(String json) {
        try {
            return objectMapper.readValue(json == null || json.isBlank() ? "{}" : json, new TypeReference<>() {});
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to read Project OS job error details.", exception);
        }
    }

    private Instant instant(String value) {
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
