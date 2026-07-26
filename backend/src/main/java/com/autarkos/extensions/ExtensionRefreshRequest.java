package com.autarkos.extensions;

import com.autarkos.pro.model.NormalizedHostSnapshot;

public record ExtensionRefreshRequest(
        String schemaVersion,
        NormalizedHostSnapshot snapshot,
        String continuationToken) {
}
