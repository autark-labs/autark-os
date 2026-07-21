package com.autarkos.extensions;

import com.fasterxml.jackson.databind.JsonNode;

public record ExtensionSurfaceEnvelope(
        String schemaVersion,
        String surface,
        String continuationToken,
        JsonNode payload) {
}
