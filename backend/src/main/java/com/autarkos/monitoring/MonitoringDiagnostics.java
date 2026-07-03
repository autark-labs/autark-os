package com.autarkos.monitoring;

import java.time.Instant;
import java.util.List;

public record MonitoringDiagnostics(
        String summary,
        int windowMinutes,
        int hostSampleCount,
        int appSampleCount,
        List<String> notes,
        MonitoringHistory history,
        Instant generatedAt) {
}
