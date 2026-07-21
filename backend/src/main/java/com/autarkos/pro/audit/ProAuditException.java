package com.autarkos.pro.audit;

public final class ProAuditException extends RuntimeException {

    public ProAuditException(Throwable cause) {
        super(
                "A required Autark Pro audit event could not be persisted.",
                cause);
    }
}
