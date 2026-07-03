package com.projectos.apps;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Comparator;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import jakarta.annotation.PreDestroy;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.projectos.api.AppOperationView;
import com.projectos.api.ProjectOsAction;
import com.projectos.host.ObservedService;
import com.projectos.host.ObservedServiceService;
import com.projectos.host.ObservedServiceView;
import com.projectos.jobs.ProjectOsJob;
import com.projectos.jobs.ProjectOsJobService;
import com.projectos.jobs.ProjectOsJobStep;
import com.projectos.marketplace.install.AppInstanceView;
import com.projectos.marketplace.install.AppInstanceViewProvider;
import com.projectos.marketplace.install.AppLifecycleService;
import com.projectos.marketplace.install.AppRuntimeView;

@Service
public class ApplicationStateService {

    private static final Duration SNAPSHOT_REFRESH_INTERVAL = Duration.ofSeconds(10);

    private final Supplier<List<AppInstanceView>> managedApps;
    private final Supplier<List<AppRuntimeView>> runtimeApps;
    private final ObservedServiceService observedServiceService;
    private final AppOwnershipService appOwnershipService;
    private final Supplier<Instant> clock;
    private final Supplier<List<ProjectOsJob>> jobs;
    private final Executor backgroundRefreshExecutor;
    private final ThreadPoolExecutor ownedBackgroundRefreshExecutor;
    private final AtomicReference<ApplicationState> cached;
    private final AtomicBoolean refreshRunning = new AtomicBoolean(false);
    private final AtomicBoolean backgroundRefreshQueued = new AtomicBoolean(false);

    @Autowired
    public ApplicationStateService(
            AppInstanceViewProvider appInstanceViewProvider,
            AppLifecycleService appLifecycleService,
            ObservedServiceService observedServiceService,
            AppOwnershipService appOwnershipService,
            ProjectOsJobService jobService) {
        this(
                appInstanceViewProvider::list,
                appLifecycleService::listApps,
                observedServiceService,
                appOwnershipService,
                Instant::now,
                jobService::list,
                defaultBackgroundRefreshExecutor(),
                true);
    }

    public ApplicationStateService(
            Supplier<List<AppInstanceView>> managedApps,
            Supplier<List<AppRuntimeView>> runtimeApps,
            ObservedServiceService observedServiceService,
            AppOwnershipService appOwnershipService,
            Supplier<Instant> clock) {
        this(managedApps, runtimeApps, observedServiceService, appOwnershipService, clock, List::of, Runnable::run, false);
    }

    public ApplicationStateService(
            Supplier<List<AppInstanceView>> managedApps,
            Supplier<List<AppRuntimeView>> runtimeApps,
            ObservedServiceService observedServiceService,
            AppOwnershipService appOwnershipService,
            Supplier<Instant> clock,
            Supplier<List<ProjectOsJob>> jobs) {
        this(managedApps, runtimeApps, observedServiceService, appOwnershipService, clock, jobs, Runnable::run, false);
    }

    public ApplicationStateService(
            Supplier<List<AppInstanceView>> managedApps,
            Supplier<List<AppRuntimeView>> runtimeApps,
            ObservedServiceService observedServiceService,
            AppOwnershipService appOwnershipService,
            Supplier<Instant> clock,
            Executor backgroundRefreshExecutor) {
        this(managedApps, runtimeApps, observedServiceService, appOwnershipService, clock, List::of, backgroundRefreshExecutor, false);
    }

    private ApplicationStateService(
            Supplier<List<AppInstanceView>> managedApps,
            Supplier<List<AppRuntimeView>> runtimeApps,
            ObservedServiceService observedServiceService,
            AppOwnershipService appOwnershipService,
            Supplier<Instant> clock,
            Supplier<List<ProjectOsJob>> jobs,
            Executor backgroundRefreshExecutor,
            boolean ownsBackgroundRefreshExecutor) {
        this.managedApps = managedApps;
        this.runtimeApps = runtimeApps;
        this.observedServiceService = observedServiceService;
        this.appOwnershipService = appOwnershipService;
        this.clock = clock;
        this.jobs = jobs == null ? List::of : jobs;
        this.backgroundRefreshExecutor = backgroundRefreshExecutor;
        this.ownedBackgroundRefreshExecutor = ownsBackgroundRefreshExecutor && backgroundRefreshExecutor instanceof ThreadPoolExecutor executor ? executor : null;
        Instant now = clock.get();
        this.cached = new AtomicReference<>(new ApplicationState(
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                now,
                "stale",
                null,
                null,
                true,
                "",
                now));
    }

    public ApplicationState snapshot() {
        return cached.get();
    }

    public ApplicationState refreshNow() {
        Instant now = clock.get();
        if (!refreshRunning.compareAndSet(false, true)) {
            return cached.get();
        }
        try {
            ApplicationState refreshed = buildSnapshot(now);
            cached.set(refreshed);
            return refreshed;
        } catch (RuntimeException exception) {
            ApplicationState failed = markFailed(cached.get(), now, exception);
            cached.set(failed);
            return failed;
        } finally {
            refreshRunning.set(false);
        }
    }

    public void invalidate() {
        refreshNow();
    }

    public void refreshInBackground() {
        if (!backgroundRefreshQueued.compareAndSet(false, true)) {
            return;
        }
        Instant startedAt = clock.get();
        cached.set(markRunning(cached.get(), startedAt));
        try {
            backgroundRefreshExecutor.execute(() -> {
                try {
                    refreshNow();
                } finally {
                    backgroundRefreshQueued.set(false);
                }
            });
        } catch (RuntimeException exception) {
            try {
                cached.set(markFailed(cached.get(), startedAt, exception));
            } finally {
                backgroundRefreshQueued.set(false);
            }
            throw exception;
        }
    }

    @PreDestroy
    public void shutdownBackgroundRefreshExecutor() {
        if (ownedBackgroundRefreshExecutor != null) {
            ownedBackgroundRefreshExecutor.shutdownNow();
        }
    }

    @Scheduled(
            initialDelayString = "${project-os.application-state.initial-delay-ms:1000}",
            fixedDelayString = "${project-os.application-state.refresh-interval-ms:10000}")
    public void refreshOnSchedule() {
        refreshNow();
    }

    private ApplicationState buildSnapshot(Instant startedAt) {
        List<AppInstanceView> managed = managedApps.get();
        List<AppRuntimeView> runtime = runtimeApps(runtimeApps.get());
        List<ObservedService> observed = cachedObservedServices();
        List<ObservedServiceView> observedViews = observed.stream()
                .map(ObservedServiceService::toView)
                .toList();
        List<ObservedServiceView> pinned = observedViews.stream()
                .filter(service -> "pinned_external".equals(service.userStatus()))
                .toList();
        List<ObservedServiceView> found = observedViews.stream()
                .filter(service -> !service.managedByThisProjectOs() && !"pinned_external".equals(service.userStatus()))
                .toList();
        List<AppOwnershipView> ownership = appOwnershipService == null ? List.of() : appOwnershipService.apps(observed);
        Instant completedAt = clock.get();
        return new ApplicationState(
                managed,
                runtime,
                observedViews,
                pinned,
                found,
                ownership,
                completedAt,
                "idle",
                startedAt,
                completedAt,
                false,
                "",
                completedAt.plus(SNAPSHOT_REFRESH_INTERVAL));
    }

    private List<AppRuntimeView> runtimeApps(List<AppRuntimeView> apps) {
        List<ProjectOsJob> operationJobs = lifecycleOperationJobs();
        List<AppRuntimeView> sorted = apps.stream()
                .sorted(Comparator.comparing(this::managedSortName).thenComparing(AppRuntimeView::appId))
                .toList();
        return java.util.stream.IntStream.range(0, sorted.size())
                .mapToObj(index -> runtimeApp(sorted.get(index), index, operationJobs))
                .toList();
    }

    private AppRuntimeView runtimeApp(AppRuntimeView app, int displayOrder, List<ProjectOsJob> operationJobs) {
        ProjectOsJob job = operationJobs.stream()
                .filter(candidate -> jobTargetsApp(candidate, app.appId()))
                .findFirst()
                .orElse(null);
        AppOperationView operation = operationState(job, app);
        return app.withSurfaceState(
                operation,
                "managed:" + app.appId(),
                displayOrder,
                availableActions(app, operation));
    }

    private List<ProjectOsJob> lifecycleOperationJobs() {
        return jobs.get().stream()
                .filter(this::isLifecycleOperationJob)
                .sorted(Comparator.comparing(ProjectOsJob::updatedAt).reversed())
                .toList();
    }

    private boolean isLifecycleOperationJob(ProjectOsJob job) {
        if (job == null || !List.of("queued", "running", "failed", "succeeded", "cancelled", "canceled").contains(job.status())) {
            return false;
        }
        return List.of("start_app", "stop_app", "restart_app", "repair_app", "backup", "backup_verify", "backup_restore", "uninstall_app").contains(job.type());
    }

    private boolean jobTargetsApp(ProjectOsJob job, String appId) {
        if (job == null || appId == null || appId.isBlank()) {
            return false;
        }
        if (appId.equals(job.subjectId())) {
            return true;
        }
        if (!"backup_restore".equals(job.type())) {
            return false;
        }
        String restoreTarget = restoreTarget(job.subjectId());
        return "all".equals(restoreTarget) || appId.equals(restoreTarget);
    }

    private String restoreTarget(String subjectId) {
        if (subjectId == null || subjectId.isBlank()) {
            return "";
        }
        int separator = subjectId.indexOf(':');
        return separator < 0 ? subjectId : subjectId.substring(separator + 1);
    }

    private AppOperationView operationState(ProjectOsJob job, AppRuntimeView app) {
        if (job == null) {
            return AppOperationView.idle();
        }
        if ("failed".equals(job.status())) {
            if (!failedLifecycleJobStillRelevant(job, app)) {
                return AppOperationView.idle();
            }
            return AppOperationView.failed(operationLabel(job.type()), job.jobId(), job.error() == null ? "" : job.error().message());
        }
        if (!"queued".equals(job.status()) && !"running".equals(job.status())) {
            return AppOperationView.idle();
        }
        return AppOperationView.running(operationKind(job.type()), operationLabel(job.type()), job.jobId(), currentStepText(job), currentStepText(job));
    }

    private boolean failedLifecycleJobStillRelevant(ProjectOsJob job, AppRuntimeView app) {
        if (isFailedFullRestore(job)) {
            return false;
        }
        if (job != null && List.of("backup", "backup_verify", "backup_restore").contains(job.type())) {
            return true;
        }
        String readinessState = app.readinessState() == null ? "" : app.readinessState();
        if (List.of("ready", "starting", "paused").contains(readinessState)) {
            return false;
        }
        String friendlyStatus = app.friendlyStatus() == null ? "" : app.friendlyStatus();
        return !List.of("Ready", "Starting", "Paused").contains(friendlyStatus);
    }

    private boolean isFailedFullRestore(ProjectOsJob job) {
        return job != null
                && "backup_restore".equals(job.type())
                && "failed".equals(job.status())
                && "all".equals(restoreTarget(job.subjectId()));
    }

    private String operationKind(String type) {
        return switch (type) {
            case "start_app" -> "starting";
            case "stop_app" -> "stopping";
            case "restart_app" -> "restarting";
            case "repair_app" -> "repairing";
            case "backup", "backup_verify" -> "backing_up";
            case "backup_restore" -> "restoring";
            case "uninstall_app" -> "uninstalling";
            default -> "idle";
        };
    }

    private String operationLabel(String type) {
        return switch (type) {
            case "start_app" -> "Starting";
            case "stop_app" -> "Pausing";
            case "restart_app" -> "Restarting";
            case "repair_app" -> "Repairing";
            case "backup", "backup_verify" -> "Creating backup";
            case "backup_restore" -> "Restoring";
            case "uninstall_app" -> "Uninstalling safely";
            default -> "Working";
        };
    }

    private String currentStepText(ProjectOsJob job) {
        ProjectOsJobStep step = job.steps().stream()
                .filter(candidate -> candidate.id().equals(job.currentStep()))
                .findFirst()
                .orElseGet(() -> job.steps().stream()
                        .filter(candidate -> "running".equals(candidate.status()))
                        .findFirst()
                        .orElseGet(() -> job.steps().stream()
                                .filter(candidate -> "pending".equals(candidate.status()))
                                .findFirst()
                                .orElse(null)));
        if (step == null) {
            return "";
        }
        return step.message() == null || step.message().isBlank() ? step.label() : step.message();
    }

    private List<ProjectOsAction> availableActions(AppRuntimeView app, AppOperationView operation) {
        if (operation != null && !"idle".equals(operation.kind()) && !"failed".equals(operation.kind())) {
            return List.of();
        }
        boolean paused = "paused".equals(app.readinessState()) || "stopped".equals(app.readinessState()) || "Stopped".equals(app.friendlyStatus());
        List<ProjectOsAction> runtimeActions = paused
                ? List.of(
                        ProjectOsAction.post("start", "Start", "/api/apps/" + app.appId() + "/start", false, false),
                        ProjectOsAction.post("restart", "Restart", "/api/apps/" + app.appId() + "/restart", false, false))
                : List.of(
                        ProjectOsAction.post("stop", "Pause", "/api/apps/" + app.appId() + "/stop", false, false),
                        ProjectOsAction.post("restart", "Restart", "/api/apps/" + app.appId() + "/restart", false, false));
        if (!repairRecommended(app)) {
            return runtimeActions;
        }
        java.util.ArrayList<ProjectOsAction> actions = new java.util.ArrayList<>(runtimeActions);
        actions.add(ProjectOsAction.post("repair", "Repair", "/api/apps/" + app.appId() + "/repair", false, false));
        return actions;
    }

    private boolean repairRecommended(AppRuntimeView app) {
        String attentionState = app.attentionState() == null ? "" : app.attentionState();
        if (List.of("needs_review", "conflict", "blocked").contains(attentionState)) {
            return true;
        }
        String readinessState = app.readinessState() == null ? "" : app.readinessState();
        if (List.of("unreachable", "unknown").contains(readinessState)) {
            return true;
        }
        String friendlyStatus = app.friendlyStatus() == null ? "" : app.friendlyStatus();
        return List.of("Needs review", "Unavailable").contains(friendlyStatus);
    }

    private String managedSortName(AppRuntimeView app) {
        return app.appName() == null ? "" : app.appName().toLowerCase(java.util.Locale.ROOT);
    }

    private ApplicationState markFailed(ApplicationState previous, Instant startedAt, RuntimeException exception) {
        Instant completedAt = clock.get();
        return new ApplicationState(
                previous.managedApps(),
                previous.runtimeApps(),
                previous.observedServices(),
                previous.pinnedExternalServices(),
                previous.foundServices(),
                previous.ownershipViews(),
                previous.updatedAt(),
                "error",
                startedAt,
                completedAt,
                true,
                exception.getMessage() == null || exception.getMessage().isBlank() ? exception.getClass().getSimpleName() : exception.getMessage(),
                completedAt.plus(SNAPSHOT_REFRESH_INTERVAL));
    }

    private ApplicationState markRunning(ApplicationState previous, Instant startedAt) {
        return new ApplicationState(
                previous.managedApps(),
                previous.runtimeApps(),
                previous.observedServices(),
                previous.pinnedExternalServices(),
                previous.foundServices(),
                previous.ownershipViews(),
                previous.updatedAt(),
                "running",
                startedAt,
                previous.refreshCompletedAt(),
                true,
                "",
                previous.nextRefreshAt());
    }

    private List<ObservedService> cachedObservedServices() {
        if (observedServiceService == null) {
            return List.of();
        }
        observedServiceService.refresh();
        return observedServiceService.observedServices();
    }

    private static ThreadPoolExecutor defaultBackgroundRefreshExecutor() {
        ThreadPoolExecutor executor = new ThreadPoolExecutor(
                1,
                1,
                0L,
                TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(1),
                runnable -> {
                    Thread thread = new Thread(runnable, "project-os-app-state-refresh");
                    thread.setDaemon(true);
                    return thread;
                },
                new ThreadPoolExecutor.AbortPolicy());
        executor.prestartAllCoreThreads();
        return executor;
    }
}
