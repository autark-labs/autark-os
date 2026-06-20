package com.projectos.system;

import java.time.Instant;

public record ProjectVersionInfo(
        String version,
        String buildSha,
        String buildDate,
        String installPath,
        String runtimePath,
        String backendJar,
        String updateChannel,
        String updateStatus,
        String updateMessage,
        Instant checkedAt) {
}
