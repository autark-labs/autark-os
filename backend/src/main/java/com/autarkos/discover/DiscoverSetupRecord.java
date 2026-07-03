package com.autarkos.discover;

import java.time.Instant;

public record DiscoverSetupRecord(
        String appId,
        String catalogAppId,
        String displayName,
        String accessMode,
        String storageMode,
        String backupPolicy,
        String localBrowserPort,
        DiscoverSetupAnswers answers,
        Instant createdAt,
        Instant updatedAt) {
}
