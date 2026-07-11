package com.autarkos.system;


import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.monitoring.MonitoringMetricsService;
import com.autarkos.apps.ApplicationStateService;

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
    private final ApplicationStateService applicationStateService;

    public SystemController(SystemSetupService setupService, SystemMetricsService metricsService, StorageService storageService, SystemSupportService supportService, ProjectSettingsService projectSettingsService, ProjectVersionService versionService, MonitoringMetricsService monitoringMetricsService, SystemDoctorService doctorService, OnboardingService onboardingService, ApplicationStateService applicationStateService) {
        this.setupService = setupService;
        this.metricsService = metricsService;
        this.storageService = storageService;
        this.supportService = supportService;
        this.projectSettingsService = projectSettingsService;
        this.versionService = versionService;
        this.monitoringMetricsService = monitoringMetricsService;
        this.doctorService = doctorService;
        this.onboardingService = onboardingService;
        this.applicationStateService = applicationStateService;
    }

    @GetMapping("/setup-status")
    public SystemSetupModels.SystemSetupStatus setupStatus() {
        return setupService.status();
    }

    @GetMapping("/doctor")
    public SystemSetupModels.SystemDoctorStatus doctor() {
        return doctorService.status();
    }

    @PostMapping("/doctor/repair-supported")
    public SystemSetupModels.SystemDoctorStatus repairSupported() {
        return doctorService.repairSupported();
    }

    @GetMapping("/onboarding")
    public OnboardingModels.OnboardingState onboarding() {
        return onboardingService.state();
    }

    @PutMapping("/onboarding")
    public OnboardingModels.OnboardingState updateOnboarding(@RequestBody OnboardingModels.OnboardingUpdateRequest request) {
        return onboardingService.update(request);
    }

    @PostMapping("/onboarding/complete")
    public OnboardingModels.OnboardingState completeOnboarding() {
        return onboardingService.complete();
    }

    @GetMapping("/metrics")
    public SystemMetrics metrics() {
        SystemMetrics metrics = metricsService.metrics();
        monitoringMetricsService.recordHost(metrics);
        return metrics;
    }

    @GetMapping("/storage")
    public StorageModels.StorageReport storage() {
        return storageService.report();
    }

    @PostMapping("/storage/orphans/{name}/cleanup")
    public StorageModels.StorageCleanupResult cleanupOrphan(@PathVariable String name) {
        return storageService.cleanupOrphan(name);
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
    public ProjectSettingsSaveResult updateSettings(@RequestBody ProjectSettings settings) {
        ProjectSettingsSaveResult result = projectSettingsService.save(settings);
        if (result.appDefaults().updatedApps() > 0) {
            applicationStateService.refreshInBackground();
        }
        return result;
    }

    @GetMapping("/support/summary")
    public SupportModels.SupportSummary supportSummary() {
        return supportService.summary();
    }

    @GetMapping("/support/logs")
    public java.util.List<SupportModels.SupportLogLine> supportLogs(@RequestParam(required = false) Integer limit) {
        return supportService.logs(limit == null ? 120 : limit);
    }

    @GetMapping("/support/bundle")
    public SupportModels.SupportBundle supportBundle() {
        return supportService.bundle();
    }
}
