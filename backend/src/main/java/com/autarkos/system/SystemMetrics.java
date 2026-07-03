package com.autarkos.system;

import java.time.Instant;

public record SystemMetrics(
        String deviceName,
        String runAsUser,
        String osName,
        String osVersion,
        String osArchitecture,
        String javaVersion,
        int availableProcessors,
        double systemCpuPercent,
        double processCpuPercent,
        double systemLoadAverage,
        long totalMemoryBytes,
        long freeMemoryBytes,
        double usedMemoryPercent,
        String runtimeRoot,
        long runtimeTotalBytes,
        long runtimeUsableBytes,
        double runtimeUsedPercent,
        Instant checkedAt) {
}
