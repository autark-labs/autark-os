package com.autarkos.pro.snapshot;

import java.time.Instant;

public record ProSnapshotMutation(
        String method,
        String path,
        String correlationId,
        Instant observedAt) {
}
