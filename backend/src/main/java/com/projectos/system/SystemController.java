package com.projectos.system;

import com.projectos.system.api.OnboardingUpdateRequest;
import com.projectos.system.api.RuntimeMigrationPlan;
import com.projectos.system.api.RuntimeMigrationPlanRequest;
import com.projectos.system.api.SupportBundle;
import com.projectos.system.api.SupportLogLine;
import com.projectos.system.api.SupportSummary;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.projectos.monitoring.MonitoringMetricsService;

@RestController
@RequestMapping("/api/system")
public class SystemController {

    private final SystemSetupService setupService;
    private final SystemMetricsService metricsService;
    private final StorageService storageService;
    private final SystemSupportService supportService;
    private final ProjectSettingsService projectSettingsService;
    private final ProjectVersionService versionService;
    private final MonitoringMetricsService monitoringMetricsService;
    private final SystemDoctorService doctorService;
    private final OnboardingService onboardingService;

    public SystemController(SystemSetupService setupService, SystemMetricsService metricsService, StorageService storageService, SystemSupportService supportService, ProjectSettingsService projectSettingsService, ProjectVersionService versionService, MonitoringMetricsService monitoringMetricsService, SystemDoctorService doctorService, OnboardingService onboardingService) {
        this.setupService = setupService;
        this.metricsService = metricsService;
        this.storageService = storageService;
        this.supportService = supportService;
        this.projectSettingsService = projectSettingsService;
        this.versionService = versionService;
        this.monitoringMetricsService = monitoringMetricsService;
        this.doctorService = doctorService;
        this.onboardingService = onboardingService;
    }

    @GetMapping("/setup-status")
    public SystemSetupStatus setupStatus() {
        return setupService.status();
    }

    @GetMapping("/doctor")
    public SystemDoctorStatus doctor() {
        return doctorService.status();
    }

    @PostMapping("/doctor/repair-supported")
    public SystemDoctorStatus repairSupported() {
        return doctorService.repairSupported();
    }

    @GetMapping("/onboarding")
    public OnboardingState onboarding() {
        return onboardingService.state();
    }

    @PutMapping("/onboarding")
    public OnboardingState updateOnboarding(@RequestBody OnboardingUpdateRequest request) {
        return onboardingService.update(request);
    }

    @PostMapping("/onboarding/complete")
    public OnboardingState completeOnboarding() {
        return onboardingService.complete();
    }

    @GetMapping("/metrics")
    public SystemMetrics metrics() {
        SystemMetrics metrics = metricsService.metrics();
        monitoringMetricsService.recordHost(metrics);
        return metrics;
    }

    @GetMapping("/storage")
    public StorageReport storage() {
        return storageService.report();
    }

    @PostMapping("/storage/orphans/{name}/cleanup")
    public StorageCleanupResult cleanupOrphan(@PathVariable String name) {
        return storageService.cleanupOrphan(name);
    }

    @PostMapping("/storage/migration/plan")
    public RuntimeMigrationPlan runtimeMigrationPlan(@RequestBody RuntimeMigrationPlanRequest request) {
        return storageService.migrationPlan(request.targetPath());
    }

    @GetMapping("/settings")
    public ProjectSettings settings() {
        return projectSettingsService.current();
    }

    @GetMapping("/version")
    public ProjectVersionInfo version() {
        return versionService.info();
    }

    @PutMapping("/settings")
    public ProjectSettings updateSettings(@RequestBody ProjectSettings settings) {
        return projectSettingsService.update(settings);
    }

    @GetMapping("/support/summary")
    public SupportSummary supportSummary() {
        return supportService.summary();
    }

    @GetMapping("/support/logs")
    public java.util.List<SupportLogLine> supportLogs(@RequestParam(required = false) Integer limit) {
        return supportService.logs(limit == null ? 120 : limit);
    }

    @GetMapping("/support/bundle")
    public SupportBundle supportBundle() {
        return supportService.bundle();
    }
}
