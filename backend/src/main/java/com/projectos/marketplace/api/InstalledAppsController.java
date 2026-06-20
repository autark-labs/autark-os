package com.projectos.marketplace.api;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.projectos.marketplace.install.AppActionResult;
import com.projectos.marketplace.install.AppAccessCheck;
import com.projectos.marketplace.install.AppLifecycleService;
import com.projectos.marketplace.install.AppHealthSnapshot;
import com.projectos.marketplace.install.AppRuntimeView;
import com.projectos.marketplace.install.AppSettingsChangePlan;
import com.projectos.marketplace.install.AppReliabilitySummary;
import com.projectos.marketplace.install.AppTelemetry;
import com.projectos.marketplace.install.AppUpdatePlan;
import com.projectos.marketplace.install.AppUpdateResult;
import com.projectos.marketplace.install.AppUpdateService;
import com.projectos.marketplace.install.AppUpdateStatus;
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.UninstallPlan;
import com.projectos.monitoring.MonitoringMetricsService;

@RestController
@RequestMapping("/api/apps")
public class InstalledAppsController {

    private final AppLifecycleService appLifecycleService;
    private final MonitoringMetricsService monitoringMetricsService;
    private final AppUpdateService appUpdateService;

    public InstalledAppsController(AppLifecycleService appLifecycleService, MonitoringMetricsService monitoringMetricsService, AppUpdateService appUpdateService) {
        this.appLifecycleService = appLifecycleService;
        this.monitoringMetricsService = monitoringMetricsService;
        this.appUpdateService = appUpdateService;
    }

    @GetMapping
    public List<AppRuntimeView> apps() {
        return appLifecycleService.listApps();
    }

    @GetMapping("/access")
    public Map<String, AppAccessCheck> accessChecks() {
        return appLifecycleService.accessChecks();
    }

    @GetMapping("/telemetry")
    public Map<String, AppTelemetry> telemetry() {
        Map<String, AppTelemetry> telemetry = appLifecycleService.telemetry();
        monitoringMetricsService.recordApps(telemetry);
        return telemetry;
    }

    @GetMapping("/health")
    public Map<String, AppHealthSnapshot> healthSnapshots() {
        return appLifecycleService.healthSnapshots();
    }

    @GetMapping("/reliability")
    public AppReliabilitySummary reliabilitySummary() {
        return appLifecycleService.reliabilitySummary();
    }

    @GetMapping("/updates")
    public List<AppUpdateStatus> updates() {
        return appUpdateService.statuses();
    }

    @GetMapping("/{id}")
    public AppRuntimeView app(@PathVariable String id) {
        return appLifecycleService.getApp(id);
    }

    @GetMapping("/{id}/telemetry")
    public AppTelemetry telemetry(@PathVariable String id) {
        AppTelemetry telemetry = appLifecycleService.telemetry(id);
        monitoringMetricsService.recordApps(Map.of(id, telemetry));
        return telemetry;
    }

    @GetMapping("/{id}/health")
    public AppHealthSnapshot healthSnapshot(@PathVariable String id) {
        return appLifecycleService.healthSnapshot(id);
    }

    @GetMapping("/{id}/uninstall-plan")
    public UninstallPlan uninstallPlan(@PathVariable String id) {
        return appLifecycleService.uninstallPlan(id);
    }

    @GetMapping("/{id}/update-plan")
    public AppUpdatePlan updatePlan(@PathVariable String id) {
        return appUpdateService.plan(id);
    }

    @PostMapping("/{id}/start")
    public AppActionResult start(@PathVariable String id) {
        return appLifecycleService.start(id);
    }

    @PostMapping("/{id}/stop")
    public AppActionResult stop(@PathVariable String id) {
        return appLifecycleService.stop(id);
    }

    @PostMapping("/{id}/restart")
    public AppActionResult restart(@PathVariable String id) {
        return appLifecycleService.restart(id);
    }

    @PostMapping("/{id}/repair")
    public AppActionResult repair(@PathVariable String id) {
        return appLifecycleService.repair(id);
    }

    @PostMapping("/{id}/update")
    public AppUpdateResult update(@PathVariable String id) {
        return appUpdateService.update(id);
    }

    @PostMapping("/{id}/rollback")
    public AppUpdateResult rollback(@PathVariable String id) {
        return appUpdateService.rollback(id);
    }

    @PostMapping("/{id}/private-access/enable")
    public AppActionResult enablePrivateAccess(@PathVariable String id) {
        return appLifecycleService.enablePrivateAccess(id);
    }

    @PostMapping("/{id}/private-access/repair")
    public AppActionResult repairPrivateAccess(@PathVariable String id) {
        return appLifecycleService.enablePrivateAccess(id);
    }

    @PostMapping("/{id}/private-access/disable")
    public AppActionResult disablePrivateAccess(@PathVariable String id) {
        return appLifecycleService.disablePrivateAccess(id);
    }

    @PutMapping("/{id}/settings")
    public AppRuntimeView updateSettings(@PathVariable String id, @RequestBody InstallSettings settings) {
        return appLifecycleService.updateSettings(id, settings);
    }

    @PostMapping("/{id}/settings-plan")
    public AppSettingsChangePlan settingsChangePlan(@PathVariable String id, @RequestBody InstallSettings settings) {
        return appLifecycleService.settingsChangePlan(id, settings);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<AppActionResult> uninstall(@PathVariable String id) {
        return ResponseEntity.ok(appLifecycleService.uninstall(id));
    }
}
