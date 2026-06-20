package com.projectos.marketplace.install;

import java.time.Instant;

public record AppHealthSnapshot(
        String appId,
        String status,
        String message,
        String detail,
        String dockerStatus,
        String localAccessStatus,
        String privateAccessStatus,
        boolean startupGrace,
        Instant checkedAt) {
}
