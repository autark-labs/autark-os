package com.autarkos.marketplace.install;

import java.time.Instant;

public record AppRuntimeMetadata(
        String appInstanceId,
        String catalogAppId,
        String instanceId,
        String composeProject,
        String manifestVersion,
        Instant createdAt) {
}
