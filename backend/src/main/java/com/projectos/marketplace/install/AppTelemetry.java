package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.List;

public record AppTelemetry(
        String cpuPercent,
        String memoryUsage,
        String memoryPercent,
        String networkIo,
        String blockIo,
        Instant checkedAt) {

    public static AppTelemetry unavailable() {
        return new AppTelemetry("Unavailable", "Unavailable", "Unavailable", "Unavailable", "Unavailable", Instant.now());
    }

    public static AppTelemetry from(List<ContainerTelemetry> containers) {
        if (containers == null || containers.isEmpty()) {
            return unavailable();
        }
        ContainerTelemetry primary = containers.get(0);
        return new AppTelemetry(
                value(primary.cpuPercent()),
                value(primary.memoryUsage()),
                value(primary.memoryPercent()),
                value(primary.networkIo()),
                value(primary.blockIo()),
                Instant.now());
    }

    private static String value(String value) {
        return value == null || value.isBlank() ? "Unavailable" : value;
    }
}
