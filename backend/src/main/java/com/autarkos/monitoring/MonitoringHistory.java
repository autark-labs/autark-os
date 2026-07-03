package com.autarkos.monitoring;

import java.time.Instant;
import java.util.List;

public record MonitoringHistory(
        int windowMinutes,
        int retentionMinutes,
        String windowLabel,
        List<HostMetricSample> hostSamples,
        List<AppMetricSample> appSamples,
        Instant checkedAt) {
}
