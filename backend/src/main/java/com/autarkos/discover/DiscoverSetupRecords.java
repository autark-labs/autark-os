package com.autarkos.discover;

import java.time.Instant;
import java.util.Map;

import com.autarkos.marketplace.install.InstallationException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

final class DiscoverSetupRecords {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private DiscoverSetupRecords() {
    }

    static DiscoverSetupEntity entity(String appId, String catalogAppId, DiscoverSetupAnswers answers, Instant createdAt, Instant updatedAt) {
        return new DiscoverSetupEntity(
                appId,
                catalogAppId,
                answers.stringValue("displayName"),
                answers.stringValue("accessMode"),
                answers.stringValue("storageMode"),
                answers.stringValue("backupPolicy"),
                answers.stringValue("localBrowserPort").isBlank() ? "auto" : answers.stringValue("localBrowserPort"),
                answersJson(answers),
                createdAt.toString(),
                updatedAt.toString());
    }

    static DiscoverSetupRecord record(DiscoverSetupEntity entity) {
        return new DiscoverSetupRecord(
                entity.appId(),
                entity.catalogAppId(),
                entity.displayName(),
                entity.accessMode(),
                entity.storageMode(),
                entity.backupPolicy(),
                entity.localBrowserPort(),
                new DiscoverSetupAnswers(answersMap(entity.answersJson())),
                Instant.parse(entity.createdAt()),
                Instant.parse(entity.updatedAt()));
    }

    private static String answersJson(DiscoverSetupAnswers answers) {
        try {
            return OBJECT_MAPPER.writeValueAsString(answers.values() == null ? Map.of() : answers.values());
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to encode Discover setup answers.", exception);
        }
    }

    private static Map<String, Object> answersMap(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return OBJECT_MAPPER.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to decode Discover setup answers.", exception);
        }
    }
}
