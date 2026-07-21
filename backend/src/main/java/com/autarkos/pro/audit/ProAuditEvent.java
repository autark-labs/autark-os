package com.autarkos.pro.audit;

public record ProAuditEvent(
        String idempotencyKey,
        ProAuditEventType type,
        String correlationId,
        String component,
        String componentVersion,
        String digest,
        String fromState,
        String toState,
        String outcome,
        String reasonCode,
        String keyId,
        String fingerprint) {
}
