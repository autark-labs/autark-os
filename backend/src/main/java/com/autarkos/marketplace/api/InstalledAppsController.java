package com.autarkos.marketplace.api;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.time.Duration;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.install.AppActionResult;
import com.autarkos.marketplace.install.AppAccessCheck;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.AppHealthSnapshot;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.marketplace.install.AppSettingsChangePlan;
import com.autarkos.marketplace.install.AppReliabilitySummary;
import com.autarkos.marketplace.install.AppTelemetry;
import com.autarkos.marketplace.install.AppUpdatePlan;
import com.autarkos.marketplace.install.AppUpdateResult;
import com.autarkos.marketplace.install.AppUpdateService;
import com.autarkos.marketplace.install.AppUpdateStatus;
import com.autarkos.marketplace.install.InstallSettings;
import com.autarkos.marketplace.install.UninstallPlan;
import com.autarkos.monitoring.MonitoringMetricsService;

@RestController
@RequestMapping("/api/apps")
public class InstalledAppsController {

    private final AppLifecycleService appLifecycleService;
    private final MonitoringMetricsService monitoringMetricsService;
    private final AppUpdateService appUpdateService;
    private final ApplicationStateService applicationStateService;
    private final AutarkOsJobService jobService;

    public InstalledAppsController(AppLifecycleService appLifecycleService, MonitoringMetricsService monitoringMetricsService, AppUpdateService appUpdateService, ApplicationStateService applicationStateService, AutarkOsJobService jobService) {
        this.appLifecycleService = appLifecycleService;
        this.monitoringMetricsService = monitoringMetricsService;
        this.appUpdateService = appUpdateService;
        this.applicationStateService = applicationStateService;
        this.jobService = jobService;
    }

    @GetMapping
    public List<AppRuntimeView> apps() {
        return applicationStateService.snapshot().runtimeApps();
    }

    @GetMapping("/access")
    public Map<String, AppAccessCheck> accessChecks() {
        Map<String, AppAccessCheck> checks = new LinkedHashMap<>();
        for (AppRuntimeView app : applicationStateService.snapshot().runtimeApps()) {
            checks.put(app.appId(), cachedAccessCheck(app));
        }
        return checks;
    }

    @GetMapping("/telemetry")
    public Map<String, AppTelemetry> telemetry() {
        Map<String, AppTelemetry> telemetry = new LinkedHashMap<>();
        for (AppRuntimeView app : applicationStateService.snapshot().runtimeApps()) {
            telemetry.put(app.appId(), app.telemetry() == null ? AppTelemetry.unavailable() : app.telemetry());
        }
        monitoringMetricsService.recordApps(telemetry);
        return telemetry;
    }

    @GetMapping("/health")
    public Map<String, AppHealthSnapshot> healthSnapshots() {
        Map<String, AppHealthSnapshot> snapshots = new LinkedHashMap<>();
        for (AppRuntimeView app : applicationStateService.snapshot().runtimeApps()) {
            if (app.healthSnapshot() != null) {
                snapshots.put(app.appId(), app.healthSnapshot());
            }
        }
        return snapshots;
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
    public AutarkOsJob start(@PathVariable String id) {
        return startLifecycleJob("start", AutarkOsStates.JobType.START_APP, id);
    }

    @PostMapping("/{id}/stop")
    public AutarkOsJob stop(@PathVariable String id) {
        return startLifecycleJob("stop", AutarkOsStates.JobType.STOP_APP, id);
    }

    @PostMapping("/{id}/restart")
    public AutarkOsJob restart(@PathVariable String id) {
        return startLifecycleJob("restart", AutarkOsStates.JobType.RESTART_APP, id);
    }

    @PostMapping("/{id}/repair")
    public AutarkOsJob repair(@PathVariable String id) {
        AutarkOsJob active = activeLifecycleJob(id);
        if (active != null) {
            applicationStateService.invalidate();
            return active;
        }
        AutarkOsJob created = jobService.startWithJob(AutarkOsStates.JobType.REPAIR_APP, id, repairJobSteps(), job -> {
            List<AutarkOsJobStep> inspecting = repairJobSteps().stream()
                    .map(step -> "inspect_app".equals(step.id())
                            ? AutarkOsJobStep.running(step.id(), step.label(), "Autark-OS is checking the app before repair.")
                            : step)
                    .toList();
            jobService.recordProgress(job.jobId(), inspecting);

            List<AutarkOsJobStep> repairing = inspecting.stream()
                    .map(step -> "inspect_app".equals(step.id())
                            ? AutarkOsJobStep.succeeded(step.id(), step.label(), "App check completed.")
                            : "run_repair".equals(step.id())
                                    ? AutarkOsJobStep.running(step.id(), step.label(), "Repairing app")
                                    : step)
                    .toList();
            jobService.recordProgress(job.jobId(), repairing);

            AppActionResult result = appLifecycleService.repair(id);
            applicationStateService.invalidate();

            if (!repairSucceeded(result)) {
                List<AutarkOsJobStep> failed = repairing.stream()
                        .map(step -> "run_repair".equals(step.id())
                                ? AutarkOsJobStep.failed(step.id(), step.label(), result.message())
                                : step)
                        .toList();
                jobService.recordProgress(job.jobId(), failed);
                return AutarkOsJobOutcome.failed(result.message(), failed);
            }

            List<AutarkOsJobStep> verifying = repairing.stream()
                    .map(step -> "run_repair".equals(step.id())
                            ? AutarkOsJobStep.succeeded(step.id(), step.label(), result.message())
                            : "verify_repair".equals(step.id())
                                    ? AutarkOsJobStep.running(step.id(), step.label(), "Checking whether the app recovered.")
                                    : step)
                    .toList();
            jobService.recordProgress(job.jobId(), verifying);

            AppRuntimeView settled = waitForLifecycleReadiness(id, "repair", result.app());
            applicationStateService.invalidate();

            List<AutarkOsJobStep> refreshed = verifying.stream()
                    .map(step -> "verify_repair".equals(step.id())
                            ? AutarkOsJobStep.succeeded(step.id(), step.label(), lifecycleCompleteMessage("repair", settled))
                            : "refresh_app_state".equals(step.id())
                                    ? AutarkOsJobStep.running(step.id(), step.label(), "Refreshing app state.")
                                    : step)
                    .toList();
            jobService.recordProgress(job.jobId(), refreshed);
            applicationStateService.invalidate();

            List<AutarkOsJobStep> completed = refreshed.stream()
                    .map(step -> "refresh_app_state".equals(step.id())
                            ? AutarkOsJobStep.succeeded(step.id(), step.label(), "App state refreshed.")
                            : step)
                    .toList();

            return AutarkOsJobOutcome.succeeded(lifecycleCompleteMessage("repair", settled), completed);
        });
        applicationStateService.invalidate();
        return created;
    }

    @PostMapping("/{id}/update")
    public AppUpdateResult update(@PathVariable String id) {
        return refreshAfter(appUpdateService.update(id));
    }

    @PostMapping("/{id}/rollback")
    public AppUpdateResult rollback(@PathVariable String id) {
        return refreshAfter(appUpdateService.rollback(id));
    }

    @PostMapping("/{id}/private-access/enable")
    public AppActionResult enablePrivateAccess(@PathVariable String id) {
        return invalidateAfter(appLifecycleService.enablePrivateAccess(id));
    }

    @PostMapping("/{id}/private-access/repair")
    public AppActionResult repairPrivateAccess(@PathVariable String id) {
        return invalidateAfter(appLifecycleService.enablePrivateAccess(id));
    }

    @PostMapping("/{id}/private-access/disable")
    public AppActionResult disablePrivateAccess(@PathVariable String id) {
        return invalidateAfter(appLifecycleService.disablePrivateAccess(id));
    }

    @PutMapping("/{id}/settings")
    public AppRuntimeView updateSettings(@PathVariable String id, @RequestBody InstallSettings settings) {
        return refreshAfter(appLifecycleService.updateSettings(id, settings));
    }

    @PostMapping("/{id}/settings-plan")
    public AppSettingsChangePlan settingsChangePlan(@PathVariable String id, @RequestBody InstallSettings settings) {
        return appLifecycleService.settingsChangePlan(id, settings);
    }

    @PostMapping("/{id}/uninstall")
    public AutarkOsJob startUninstall(@PathVariable String id) {
        AutarkOsJob job = jobService.start(AutarkOsStates.JobType.UNINSTALL_APP, id, uninstallJobSteps(), () -> {
            AppActionResult result = appLifecycleService.uninstall(id);
            applicationStateService.invalidate();
            return AutarkOsJobOutcome.succeeded(result.message());
        });
        applicationStateService.invalidate();
        return job;
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<AppActionResult> uninstall(@PathVariable String id) {
        return ResponseEntity.ok(refreshAfter(appLifecycleService.uninstall(id)));
    }

    private <T> T refreshAfter(T result) {
        applicationStateService.refreshInBackground();
        return result;
    }

    private AppActionResult refreshAfter(AppActionResult result) {
        applicationStateService.invalidate();
        return result.withApplicationState(applicationStateService.snapshot());
    }

    private <T> T invalidateAfter(T result) {
        applicationStateService.invalidate();
        return result;
    }

    private AppActionResult invalidateAfter(AppActionResult result) {
        applicationStateService.invalidate();
        return result.withApplicationState(applicationStateService.snapshot());
    }

    private AutarkOsJob startLifecycleJob(String action, String jobType, String id) {
        AutarkOsJob active = activeLifecycleJob(id);
        if (active != null) {
            applicationStateService.invalidate();
            return active;
        }
        AutarkOsJob created = jobService.startWithJob(jobType, id, lifecycleJobSteps(action), job -> {
            List<AutarkOsJobStep> runningCommand = lifecycleJobSteps(action).stream()
                    .map(step -> "run_command".equals(step.id())
                            ? AutarkOsJobStep.running(step.id(), step.label(), lifecycleRunMessage(action))
                            : step)
                    .toList();
            jobService.recordProgress(job.jobId(), runningCommand);

            AppActionResult result = switch (action) {
                case "start" -> appLifecycleService.start(id);
                case "stop" -> appLifecycleService.stop(id);
                case "restart" -> appLifecycleService.restart(id);
                default -> throw new IllegalArgumentException("Unsupported app lifecycle action: " + action);
            };
            applicationStateService.invalidate();

            List<AutarkOsJobStep> waiting = runningCommand.stream()
                    .map(step -> "run_command".equals(step.id())
                            ? AutarkOsJobStep.succeeded(step.id(), step.label(), lifecycleCommandCompleteMessage(action))
                            : "wait_until_ready".equals(step.id())
                                    ? AutarkOsJobStep.running(step.id(), step.label(), lifecycleWaitMessage(action))
                                    : step)
                    .toList();
            jobService.recordProgress(job.jobId(), waiting);

            AppRuntimeView settled = waitForLifecycleReadiness(id, action, result.app());
            applicationStateService.invalidate();

            return AutarkOsJobOutcome.succeeded(lifecycleCompleteMessage(action, settled), waiting.stream()
                    .map(step -> "wait_until_ready".equals(step.id())
                            ? AutarkOsJobStep.succeeded(step.id(), step.label(), lifecycleCompleteMessage(action, settled))
                            : step)
                    .toList());
        });
        applicationStateService.invalidate();
        return created;
    }

    private AutarkOsJob activeLifecycleJob(String id) {
        return jobService.list().stream()
                .filter(job -> id.equals(job.subjectId()))
                .filter(job -> List.of(AutarkOsStates.JobType.START_APP, AutarkOsStates.JobType.STOP_APP, AutarkOsStates.JobType.RESTART_APP, AutarkOsStates.JobType.REPAIR_APP).contains(job.type()))
                .filter(job -> AutarkOsStates.JobStatus.QUEUED.equals(job.status()) || AutarkOsStates.JobStatus.RUNNING.equals(job.status()))
                .findFirst()
                .orElse(null);
    }

    private AppRuntimeView waitForLifecycleReadiness(String id, String action, AppRuntimeView initial) {
        AppRuntimeView current = initial;
        if (lifecycleReadinessResolved(action, current)) {
            return current;
        }
        long deadline = System.nanoTime() + Duration.ofSeconds(90).toNanos();
        while (System.nanoTime() < deadline) {
            sleepBeforeReadinessCheck();
            current = appLifecycleService.getApp(id);
            applicationStateService.invalidate();
            if (lifecycleReadinessResolved(action, current)) {
                return current;
            }
        }
        throw new IllegalStateException(lifecycleTimeoutMessage(action));
    }

    private boolean repairSucceeded(AppActionResult result) {
        return result != null && result.ok() && !"needs_attention".equals(result.status());
    }

    private boolean lifecycleReadinessResolved(String action, AppRuntimeView app) {
        if (app == null) {
            return true;
        }
        String readiness = app.readinessState() == null ? "" : app.readinessState();
        if ("repair".equals(action)) {
            return "ready".equals(readiness) || "paused".equals(readiness);
        }
        if ("stop".equals(action)) {
            return "paused".equals(readiness) || "stopped".equals(readiness);
        }
        return "ready".equals(readiness);
    }

    private void sleepBeforeReadinessCheck() {
        try {
            Thread.sleep(1_000);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Autark-OS stopped waiting for app readiness.", exception);
        }
    }

    private List<AutarkOsJobStep> lifecycleJobSteps(String action) {
        return List.of(
                AutarkOsJobStep.pending("run_command", lifecycleRunLabel(action)),
                AutarkOsJobStep.pending("wait_until_ready", lifecycleWaitLabel(action)));
    }

    private String lifecycleRunLabel(String action) {
        return switch (action) {
            case "start" -> "Start app";
            case "stop" -> "Pause app";
            case "restart" -> "Restart app";
            case "repair" -> "Repair app";
            default -> "Run app command";
        };
    }

    private String lifecycleWaitLabel(String action) {
        return switch (action) {
            case "stop" -> "Confirm app paused";
            case "repair" -> "Confirm app recovered";
            default -> "Confirm app is ready";
        };
    }

    private String lifecycleRunMessage(String action) {
        return switch (action) {
            case "start" -> "Autark-OS is starting the app.";
            case "stop" -> "Autark-OS is pausing the app.";
            case "restart" -> "Autark-OS is restarting the app.";
            case "repair" -> "Autark-OS is repairing the app.";
            default -> "Autark-OS is running the app command.";
        };
    }

    private String lifecycleCommandCompleteMessage(String action) {
        return switch (action) {
            case "start" -> "Start command completed.";
            case "stop" -> "Pause command completed.";
            case "restart" -> "Restart command completed.";
            case "repair" -> "Repair command completed.";
            default -> "App command completed.";
        };
    }

    private String lifecycleWaitMessage(String action) {
        if ("repair".equals(action)) {
            return "Waiting for the app to report recovered.";
        }
        return "stop".equals(action)
                ? "Waiting for the app to report paused."
                : "Waiting for the app to report ready.";
    }

    private String lifecycleCompleteMessage(String action, AppRuntimeView app) {
        String appName = app == null || app.appName() == null || app.appName().isBlank() ? "App" : app.appName();
        return switch (action) {
            case "start" -> appName + " is ready.";
            case "stop" -> appName + " is paused.";
            case "restart" -> appName + " is ready after restart.";
            case "repair" -> appName + " recovered.";
            default -> appName + " action finished.";
        };
    }

    private String lifecycleTimeoutMessage(String action) {
        if ("repair".equals(action)) {
            return "Autark-OS ran repair, but the app did not report recovered in time.";
        }
        return "stop".equals(action)
                ? "Autark-OS paused the app command, but the app did not report paused in time."
                : "Autark-OS ran the app command, but the app did not report ready in time.";
    }

    private AppAccessCheck cachedAccessCheck(AppRuntimeView app) {
        AppHealthSnapshot health = app.healthSnapshot();
        if (health == null || health.localAccessStatus() == null || "not_configured".equals(health.localAccessStatus())) {
            return AppAccessCheck.notConfigured(app.appId());
        }
        String message = "reachable".equals(health.localAccessStatus()) ? "App link is responding." : "App is running, but the link is not responding.";
        return new AppAccessCheck(app.appId(), app.accessUrl(), health.localAccessStatus(), message, health.checkedAt());
    }

    private List<AutarkOsJobStep> uninstallJobSteps() {
        return List.of(
                AutarkOsJobStep.pending("load_uninstall_plan", "Load uninstall plan"),
                AutarkOsJobStep.pending("create_safety_checkpoint", "Create safety checkpoint"),
                AutarkOsJobStep.pending("stop_remove_compose_project", "Stop and remove app containers"),
                AutarkOsJobStep.pending("preserve_data", "Preserve app data"),
                AutarkOsJobStep.pending("remove_app_record", "Remove app from My Apps"),
                AutarkOsJobStep.pending("refresh_app_state", "Refresh app state"));
    }

    private List<AutarkOsJobStep> repairJobSteps() {
        return List.of(
                AutarkOsJobStep.pending("inspect_app", "Inspect app"),
                AutarkOsJobStep.pending("run_repair", "Run repair"),
                AutarkOsJobStep.pending("verify_repair", "Verify repair"),
                AutarkOsJobStep.pending("refresh_app_state", "Refresh app state"));
    }
}
