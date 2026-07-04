package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class AppRuntimeMetadataReader {

    private final ObjectMapper objectMapper = new ObjectMapper();

    public Optional<RuntimeModels.AppRuntimeMetadata> read(Path appRoot) {
        if (appRoot == null) {
            return Optional.empty();
        }
        Path metadataFile = appRoot.resolve(AppRuntimeMetadataWriter.METADATA_FILE);
        if (!Files.isRegularFile(metadataFile)) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(metadataFile.toFile());
            String appInstanceId = text(root, "appInstanceId");
            String catalogAppId = text(root, "catalogAppId");
            String instanceId = text(root, "instanceId");
            String composeProject = text(root, "composeProject");
            String manifestVersion = text(root, "manifestVersion");
            if (catalogAppId.isBlank() || composeProject.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(new RuntimeModels.AppRuntimeMetadata(
                    appInstanceId,
                    catalogAppId,
                    instanceId,
                    composeProject,
                    manifestVersion,
                    instant(text(root, "createdAt"))));
        } catch (IOException | RuntimeException exception) {
            return Optional.empty();
        }
    }

    private String text(JsonNode root, String field) {
        JsonNode value = root.path(field);
        return value.isMissingNode() || value.isNull() ? "" : value.asText("").trim();
    }

    private Instant instant(String value) {
        if (value == null || value.isBlank()) {
            return Instant.EPOCH;
        }
        try {
            return Instant.parse(value);
        } catch (RuntimeException exception) {
            return Instant.EPOCH;
        }
    }
}
