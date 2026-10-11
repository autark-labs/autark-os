package com.autarkos.jobs;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.autarkos.marketplace.install.InstallationException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

final class AutarkOsJobs {

    private AutarkOsJobs() {
    }

    static AutarkOsJob toDomain(AutarkOsJobEntity entity, ObjectMapper objectMapper) {
        String errorCode = entity.errorCode();
        AutarkOsJobError error = errorCode == null || errorCode.isBlank()
                ? null
                : new AutarkOsJobError(errorCode, entity.errorMessage(), errorDetails(entity.errorDetailsJson(), objectMapper));
        return new AutarkOsJob(
                entity.jobId(),
                entity.type(),
                entity.subjectId(),
                entity.status(),
                clean(entity.currentStep(), ""),
                steps(entity.stepsJson(), objectMapper),
                Instant.parse(entity.createdAt()),
                Instant.parse(entity.updatedAt()),
                error);
    }

    static String stepsJson(List<AutarkOsJobStep> steps, ObjectMapper objectMapper) {
        List<Map<String, Object>> values = (steps == null ? List.<AutarkOsJobStep>of() : steps).stream()
                .map(step -> {
                    Map<String, Object> value = new java.util.LinkedHashMap<>();
                    value.put("id", clean(step.id(), ""));
                    value.put("label", clean(step.label(), ""));
                    value.put("status", clean(step.status(), "pending"));
                    value.put("message", clean(step.message(), ""));
                    value.put("startedAt", step.startedAt() == null ? "" : step.startedAt().toString());
                    value.put("finishedAt", step.finishedAt() == null ? "" : step.finishedAt().toString());
                    if (step.recovery() != null) value.put("recovery", step.recovery());
                    return value;
                }).toList();
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to serialize Autark-OS job steps.", exception);
        }
    }

    static String errorDetailsJson(Map<String, String> details, ObjectMapper objectMapper) {
        try {
            return objectMapper.writeValueAsString(details == null ? Map.of() : details);
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to serialize Autark-OS job error details.", exception);
        }
    }

    static String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static List<AutarkOsJobStep> steps(String json, ObjectMapper objectMapper) {
        try {
            List<com.fasterxml.jackson.databind.JsonNode> values = objectMapper.readValue(json == null || json.isBlank() ? "[]" : json, new TypeReference<>() {});
            return values.stream()
                    .map(value -> new AutarkOsJobStep(
                            value.path("id").asText(""),
                            value.path("label").asText(""),
                            value.path("status").asText("pending"),
                            value.path("message").asText(""),
                            instant(value.path("startedAt").asText()),
                            instant(value.path("finishedAt").asText()),
                            value.hasNonNull("recovery") ? new AutarkOsJobStep.Recovery(
                                    value.path("recovery").path("appId").asText(),
                                    value.path("recovery").path("appInstanceId").asText(),
                                    value.path("recovery").path("resumeAllowed").asBoolean()) : null))
                    .toList();
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to read Autark-OS job steps.", exception);
        }
    }

    private static Map<String, String> errorDetails(String json, ObjectMapper objectMapper) {
        try {
            return objectMapper.readValue(json == null || json.isBlank() ? "{}" : json, new TypeReference<>() {});
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to read Autark-OS job error details.", exception);
        }
    }

    private static Instant instant(String value) {
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }
}
