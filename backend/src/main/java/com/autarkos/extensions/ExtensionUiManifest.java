package com.autarkos.extensions;

import java.util.List;

public record ExtensionUiManifest(
        String schemaVersion,
        String extensionId,
        String componentVersion,
        String entrypoint,
        String entrypointSha256,
        List<String> surfaces) {
}
