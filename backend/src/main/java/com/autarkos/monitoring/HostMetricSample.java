package com.autarkos.monitoring;

import java.time.Instant;

public record HostMetricSample(
        double systemCpuPercent,
        double processCpuPercent,
        double usedMemoryPercent,
        double runtimeUsedPercent,
        long totalMemoryBytes,
        long freeMemoryBytes,
        long runtimeTotalBytes,
        long runtimeUsableBytes,
        Instant sampledAt) {
}
