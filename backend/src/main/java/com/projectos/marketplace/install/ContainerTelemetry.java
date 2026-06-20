package com.projectos.marketplace.install;

public record ContainerTelemetry(
        String containerName,
        String cpuPercent,
        String memoryUsage,
        String memoryPercent,
        String networkIo,
        String blockIo) {
}
