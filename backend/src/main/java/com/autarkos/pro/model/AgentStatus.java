package com.autarkos.pro.model;

import java.time.Instant;
import java.util.List;

public record AgentStatus(
        String schemaVersion,
        String componentVersion,
        String apiVersion,
        List<String> supportedSnapshotSchemaVersions,
        List<String> supportedSurfaceSchemaVersions,
        String state,
        boolean ready,
        String reasonCode,
        Instant startedAt) {
}
