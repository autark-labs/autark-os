package com.autarkos.extensions;

import com.fasterxml.jackson.databind.JsonNode;

public record ExtensionSurfaceResult(
        JsonNode payload,
        ExtensionStateStatus state) {
}
