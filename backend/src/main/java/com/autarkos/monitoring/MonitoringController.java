package com.autarkos.monitoring;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/monitoring")
public class MonitoringController {

    private final MonitoringMetricsService monitoringMetricsService;

    public MonitoringController(MonitoringMetricsService monitoringMetricsService) {
        this.monitoringMetricsService = monitoringMetricsService;
    }

    @GetMapping("/history")
    public MonitoringHistory history(@RequestParam(required = false) Integer windowMinutes) {
        return monitoringMetricsService.history(windowMinutes);
    }

    @GetMapping("/diagnostics")
    public MonitoringDiagnostics diagnostics(@RequestParam(required = false) Integer windowMinutes) {
        return monitoringMetricsService.diagnostics(windowMinutes);
    }
}
