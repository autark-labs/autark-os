package com.autarkos.extensions;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Generic private UI transport. Action semantics belong to the installed agent. */
public record ExtensionActionRequest(String schemaVersion, String surface, String actionId, JsonNode payload) {
    public static final int MAX_BYTES = 16 * 1024;
    private static final ObjectMapper MAPPER = new ObjectMapper(JsonFactory.builder()
            .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(32).build())
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build())
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    public static ExtensionActionRequest decode(byte[] body) {
        if (body.length > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Extension action is too large.");
        }
        try {
            var request = MAPPER.readValue(body, ExtensionActionRequest.class);
            request.validate();
            return request;
        } catch (java.io.IOException | IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid extension action.");
        }
    }

    public void validate() {
        if (!"1".equals(schemaVersion) || surface == null || !surface.matches("^[a-z][a-z0-9.-]{1,127}$")
                || actionId == null || !actionId.matches("^[a-z][a-z0-9.-]{1,127}$")
                || payload == null || !payload.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid extension action.");
        }
    }
}
