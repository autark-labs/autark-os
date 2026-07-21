package com.autarkos.activity;

import java.time.Instant;
import java.util.UUID;

public record ApiMutationCompletedEvent(
        String method,
        String path,
        int status,
        String correlationId,
        Instant occurredAt) {

    public ApiMutationCompletedEvent(
            String method,
            String path,
            int status) {
        this(
                method,
                path,
                status,
                UUID.randomUUID().toString(),
                Instant.now());
    }
}
