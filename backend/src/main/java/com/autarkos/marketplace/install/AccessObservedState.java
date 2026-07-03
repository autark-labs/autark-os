package com.autarkos.marketplace.install;

import java.time.Instant;

public record AccessObservedState(
        String localUrl,
        String privateUrl,
        Integer localPort,
        String protocol,
        String privateLinkStatus,
        Instant lastAccessCheckAt,
        Instant lastSuccessfulAccessAt,
        Instant lastRepairAttemptAt,
        String lastRepairStatus) {
}
