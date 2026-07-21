package com.autarkos.extensions;

import com.autarkos.pro.model.NormalizedHostSnapshot;

public record ExtensionSurfaceRequest(
        String schemaVersion,
        String surface,
        NormalizedHostSnapshot snapshot,
        String continuationToken) {
}
