package com.projectos.monitoring;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.projectos.marketplace.install.AppTelemetry;
import com.projectos.system.SystemMetrics;

@Service
public class MonitoringMetricsService {

    private static final int DEFAULT_WINDOW_MINUTES = 60;
    private static final int RETENTION_MINUTES = 360;

    private final MonitoringMetricsRepository repository;

    public MonitoringMetricsService(MonitoringMetricsRepository repository) {
        this.repository = repository;
    }

    public void recordHost(SystemMetrics metrics) {
        if (metrics == null) {
            return;
        }
        repository.recordHost(new HostMetricSample(
                normalize(metrics.systemCpuPercent()),
                normalize(metrics.processCpuPercent()),
                normalize(metrics.usedMemoryPercent()),
                normalize(metrics.runtimeUsedPercent()),
                metrics.totalMemoryBytes(),
                metrics.freeMemoryBytes(),
                metrics.runtimeTotalBytes(),
                metrics.runtimeUsableBytes(),
                metrics.checkedAt()));
        enforceRetention();
    }

    public void recordApps(Map<String, AppTelemetry> telemetryByAppId) {
        if (telemetryByAppId == null || telemetryByAppId.isEmpty()) {
            return;
        }
        Instant sampledAt = Instant.now();
        telemetryByAppId.forEach((appId, telemetry) -> {
            if (appId == null || appId.isBlank() || telemetry == null) {
                return;
            }
            repository.recordApp(new AppMetricSample(
                    appId,
                    parsePercent(telemetry.cpuPercent()),
                    parsePercent(telemetry.memoryPercent()),
                    telemetry.memoryUsage(),
                    telemetry.checkedAt() == null ? sampledAt : telemetry.checkedAt()));
        });
        enforceRetention();
    }

    public MonitoringHistory history(Integer requestedWindowMinutes) {
        int windowMinutes = safeWindow(requestedWindowMinutes);
        Instant since = Instant.now().minus(Duration.ofMinutes(windowMinutes));
        return new MonitoringHistory(
                windowMinutes,
                RETENTION_MINUTES,
                windowLabel(windowMinutes),
                repository.hostSamplesSince(since),
                repository.appSamplesSince(since),
                Instant.now());
    }

    public MonitoringDiagnostics diagnostics(Integer requestedWindowMinutes) {
        MonitoringHistory history = history(requestedWindowMinutes);
        List<String> notes = new ArrayList<>();
        notes.add("Metric samples are collected when the frontend or API requests live host/app telemetry.");
        notes.add("Retention is bounded to " + RETENTION_MINUTES + " minutes.");
        if (history.hostSamples().isEmpty()) {
            notes.add("No host samples exist in this window yet.");
        }
        if (history.appSamples().isEmpty()) {
            notes.add("No app telemetry samples exist in this window yet.");
        }
        return new MonitoringDiagnostics(
                "Monitoring diagnostics for " + history.windowLabel() + ".",
                history.windowMinutes(),
                history.hostSamples().size(),
                history.appSamples().size(),
                notes,
                history,
                Instant.now());
    }

    private void enforceRetention() {
        repository.deleteBefore(Instant.now().minus(Duration.ofMinutes(RETENTION_MINUTES)));
    }

    private int safeWindow(Integer requestedWindowMinutes) {
        if (requestedWindowMinutes == null || requestedWindowMinutes <= 0) {
            return DEFAULT_WINDOW_MINUTES;
        }
        return Math.max(5, Math.min(requestedWindowMinutes, RETENTION_MINUTES));
    }

    private String windowLabel(int minutes) {
        if (minutes < 60) {
            return "Last " + minutes + " minutes";
        }
        int hours = minutes / 60;
        return "Last " + hours + " hour" + (hours == 1 ? "" : "s");
    }

    private double normalize(double value) {
        if (!Double.isFinite(value) || value < 0) {
            return 0;
        }
        return Math.max(0, Math.min(100, value));
    }

    private double parsePercent(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            return normalize(Double.parseDouble(value.replace("%", "").trim()));
        } catch (NumberFormatException exception) {
            return 0;
        }
    }
}
