package com.autarkos.system;

import java.time.Instant;

public record AutarkOsIdentity(
        String instanceId,
        String instanceSlug,
        String runtimeRoot,
        String runtimeRootHash,
        Instant createdAt,
        int schemaVersion) {
}
