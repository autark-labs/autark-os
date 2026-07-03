package com.autarkos.marketplace.install;

import java.time.Instant;

public record InstalledAppOwnershipMetadata(
        String appId,
        String appInstanceId,
        String catalogAppId,
        String autarkOsInstanceId,
        String runtimePathOrHash,
        String installState,
        String ownershipStatus,
        Instant createdAt,
        Instant updatedAt) {
}
