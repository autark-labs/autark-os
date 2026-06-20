package com.projectos.monitoring;

import java.time.Instant;

public record AppMetricSample(
        String appId,
        double cpuPercent,
        double memoryPercent,
        String memoryUsage,
        Instant sampledAt) {
}
