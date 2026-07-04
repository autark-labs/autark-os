package com.autarkos.discover;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class DiscoverSetupModels {

    private DiscoverSetupModels() {
    }

    public record DiscoverSetupSchema(
            String appId,
            int version,
            List<DiscoverSetupInput> inputs) {
    }

    public record DiscoverSetupAnswers(Map<String, Object> values) {

        public Object value(String id) {
            return values == null ? null : values.get(id);
        }

        public String stringValue(String id) {
            Object value = value(id);
            return value == null ? "" : String.valueOf(value).trim();
        }
    }

    public record DiscoverSetupAnswersRequest(Map<String, Object> answers) {

        public DiscoverSetupAnswers setupAnswers() {
            return new DiscoverSetupAnswers(answers == null ? Map.of() : answers);
        }
    }

    public record DiscoverSetupInput(
            String id,
            String label,
            String type,
            String tier,
            boolean required,
            Object defaultValue,
            String help,
            List<DiscoverSetupOption> options,
            Map<String, String> showWhen) {
    }

    public record DiscoverSetupOption(
            String value,
            String label,
            String description,
            boolean recommended,
            boolean advanced) {
    }

    public record DiscoverSetupRecord(
            String appId,
            String catalogAppId,
            String displayName,
            String accessMode,
            String storageMode,
            String backupPolicy,
            String localBrowserPort,
            DiscoverSetupAnswers answers,
            Instant createdAt,
            Instant updatedAt) {
    }
}
