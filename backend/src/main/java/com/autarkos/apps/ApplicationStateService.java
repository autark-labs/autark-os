package com.autarkos.apps;

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

import com.autarkos.api.AutarkOsStates;
import com.autarkos.api.AppOperationView;
import com.autarkos.api.AutarkOsAction;
import com.autarkos.host.HostModels;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppInstanceViewProvider;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.AppRuntimeView;

@Service
public class ApplicationStateService {

    private static final Duration SNAPSHOT_REFRESH_INTERVAL = Duration.ofSeconds(10);

    private final Supplier<List<AppInstanceView>> managedAppViews;
    private final Supplier<List<AppRuntimeView>> runtimeAppViews;
    private final ObservedServiceService observedServiceService;
    private final ApplicationInventoryService applicationInventoryService;
    private final Supplier<Instant> clock;
    private final Supplier<List<AutarkOsJob>> jobs;
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
            ApplicationInventoryService applicationInventoryService,
            AutarkOsJobService jobService) {
        this(
                appInstanceViewProvider::list,
                appLifecycleService::listApps,
                observedServiceService,
                applicationInventoryService,
                Instant::now,
                jobService::list,
                defaultBackgroundRefreshExecutor(),
                true);
    }

    public ApplicationStateService(
            Supplier<List<AppInstanceView>> managedAppViews,
            Supplier<List<AppRuntimeView>> runtimeAppViews,
            ObservedServiceService observedServiceService,
            ApplicationInventoryService applicationInventoryService,
            Supplier<Instant> clock) {
        this(managedAppViews, runtimeAppViews, observedServiceService, applicationInventoryService, clock, List::of, Runnable::run, false);
    }

    public ApplicationStateService(
            Supplier<List<AppInstanceView>> managedAppViews,
            Supplier<List<AppRuntimeView>> runtimeAppViews,
            ObservedServiceService observedServiceService,
            ApplicationInventoryService applicationInventoryService,
            Supplier<Instant> clock,
            Supplier<List<AutarkOsJob>> jobs) {
        this(managedAppViews, runtimeAppViews, observedServiceService, applicationInventoryService, clock, jobs, Runnable::run, false);
    }

    public ApplicationStateService(
            Supplier<List<AppInstanceView>> managedAppViews,
            Supplier<List<AppRuntimeView>> runtimeAppViews,
            ObservedServiceService observedServiceService,
            ApplicationInventoryService applicationInventoryService,
            Supplier<Instant> clock,
            Executor backgroundRefreshExecutor) {
        this(managedAppViews, runtimeAppViews, observedServiceService, applicationInventoryService, clock, List::of, backgroundRefreshExecutor, false);
    }

    private ApplicationStateService(
            Supplier<List<AppInstanceView>> managedAppViews,
            Supplier<List<AppRuntimeView>> runtimeAppViews,
            ObservedServiceService observedServiceService,
            ApplicationInventoryService applicationInventoryService,
            Supplier<Instant> clock,
            Supplier<List<AutarkOsJob>> jobs,
            Executor backgroundRefreshExecutor,
            boolean ownsBackgroundRefreshExecutor) {
        this.managedAppViews = managedAppViews;
        this.runtimeAppViews = runtimeAppViews;
        this.observedServiceService = observedServiceService;
        this.applicationInventoryService = applicationInventoryService;
        this.clock = clock;
        this.jobs = jobs == null ? List::of : jobs;
        this.backgroundRefreshExecutor = backgroundRefreshExecutor;
        this.ownedBackgroundRefreshExecutor = ownsBackgroundRefreshExecutor && backgroundRefreshExecutor instanceof ThreadPoolExecutor executor ? executor : null;
        Instant now = clock.get();
        this.cached = new AtomicReference<>(new ApplicationState(
                List.of(),
                null,
                AutarkOsStates.SnapshotState.STALE,
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
            initialDelayString = "${autark-os.application-state.initial-delay-ms:1000}",
            fixedDelayString = "${autark-os.application-state.refresh-interval-ms:10000}")
    public void refreshOnSchedule() {
        refreshNow();
    }

    private ApplicationState buildSnapshot(Instant startedAt) {
        List<AppRuntimeView> runtime = decorateRuntimeApps(runtimeAppViews.get());
        // Runtime observation writes the freshly derived status; build management views only afterwards.
        List<AppInstanceView> managed = managedAppViews.get();
        List<ObservedService> observed = cachedObservedServices();
        List<ApplicationView> applications = applicationInventoryService.apps(observed, managed, runtime);
        Instant completedAt = clock.get();
        return new ApplicationState(
                applications,
                completedAt,
                AutarkOsStates.SnapshotState.IDLE,
                startedAt,
                completedAt,
                false,
                "",
                completedAt.plus(SNAPSHOT_REFRESH_INTERVAL));
    }

    private List<AppRuntimeView> decorateRuntimeApps(List<AppRuntimeView> apps) {
        List<AutarkOsJob> operationJobs = lifecycleOperationJobs();
        List<AppRuntimeView> sorted = apps.stream()
                .sorted(Comparator.comparing(this::managedSortName).thenComparing(AppRuntimeView::appId))
                .toList();
        return java.util.stream.IntStream.range(0, sorted.size())
                .mapToObj(index -> runtimeApp(sorted.get(index), index, operationJobs))
                .toList();
    }

    private AppRuntimeView runtimeApp(AppRuntimeView app, int displayOrder, List<AutarkOsJob> operationJobs) {
        List<AutarkOsJob> matchingJobs = operationJobs.stream()
                .filter(candidate -> jobTargetsApp(candidate, app.appId()))
                .toList();
        AutarkOsJob job = matchingJobs.stream().filter(candidate ->
                AutarkOsStates.JobStatus.QUEUED.equals(candidate.status()) || AutarkOsStates.JobStatus.RUNNING.equals(candidate.status()))
                .findFirst().orElseGet(() -> matchingJobs.stream()
                        .filter(candidate -> AutarkOsStates.JobStatus.FAILED.equals(candidate.status()))
                        .filter(candidate -> failedLifecycleJobStillRelevant(candidate, app))
                        .filter(candidate -> matchingJobs.stream().noneMatch(later ->
                                AutarkOsStates.JobStatus.SUCCEEDED.equals(later.status())
                                        && later.type().equals(candidate.type())
                                        && later.updatedAt().isAfter(candidate.updatedAt())))
                        .findFirst().orElse(null));
        AppOperationView operation = operationState(job, app);
        return app.withSurfaceState(
                operation,
                "managed:" + app.appId(),
                displayOrder,
                availableActions(app, operation));
    }

    private List<AutarkOsJob> lifecycleOperationJobs() {
        return jobs.get().stream()
                .filter(this::isLifecycleOperationJob)
                .sorted(Comparator.comparing(AutarkOsJob::updatedAt).reversed())
                .toList();
    }

    private boolean isLifecycleOperationJob(AutarkOsJob job) {
        if (job == null || !List.of(
                AutarkOsStates.JobStatus.QUEUED,
                AutarkOsStates.JobStatus.RUNNING,
                AutarkOsStates.JobStatus.FAILED,
                AutarkOsStates.JobStatus.SUCCEEDED,
                AutarkOsStates.JobStatus.CANCELLED,
                AutarkOsStates.JobStatus.CANCELED).contains(job.status())) {
            return false;
        }
        return List.of(
                AutarkOsStates.JobType.START_APP,
                AutarkOsStates.JobType.STOP_APP,
                AutarkOsStates.JobType.RESTART_APP,
                AutarkOsStates.JobType.REPAIR_APP,
                AutarkOsStates.JobType.SAVE_APP_SETTINGS,
                AutarkOsStates.JobType.BACKUP,
                AutarkOsStates.JobType.BACKUP_VERIFY,
                AutarkOsStates.JobType.BACKUP_RESTORE,
                AutarkOsStates.JobType.UNINSTALL_APP,
                AutarkOsStates.JobType.UPDATE_APP,
                AutarkOsStates.JobType.ROLLBACK_APP).contains(job.type());
    }

    private boolean jobTargetsApp(AutarkOsJob job, String appId) {
        if (job == null || appId == null || appId.isBlank()) {
            return false;
        }
        if (appId.equals(job.subjectId())) {
            return true;
        }
        if (!AutarkOsStates.JobType.BACKUP_RESTORE.equals(job.type())) {
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

    private AppOperationView operationState(AutarkOsJob job, AppRuntimeView app) {
        if (job == null) {
            return AppOperationView.idle();
        }
        if (AutarkOsStates.JobStatus.FAILED.equals(job.status())) {
            if (!failedLifecycleJobStillRelevant(job, app)) {
                return AppOperationView.idle();
            }
            return AppOperationView.failed(failedOperationLabel(job.type()), job.jobId(), job.error() == null ? "" : job.error().message(), job.type());
        }
        if (!AutarkOsStates.JobStatus.QUEUED.equals(job.status()) && !AutarkOsStates.JobStatus.RUNNING.equals(job.status())) {
            return AppOperationView.idle();
        }
        return AppOperationView.running(operationKind(job.type()), operationLabel(job.type()), job.jobId(), currentStepText(job), currentStepText(job));
    }

    private boolean failedLifecycleJobStillRelevant(AutarkOsJob job, AppRuntimeView app) {
        if (isFailedFullRestore(job)) {
            return false;
        }
        if (job != null && !List.of(AutarkOsStates.JobType.START_APP, AutarkOsStates.JobType.STOP_APP,
                AutarkOsStates.JobType.RESTART_APP, AutarkOsStates.JobType.REPAIR_APP).contains(job.type())) {
            return true;
        }
        String readinessState = app.readinessState() == null ? "" : app.readinessState();
        if (List.of(AutarkOsStates.ReadinessState.READY, AutarkOsStates.ReadinessState.STARTING, AutarkOsStates.ReadinessState.PAUSED).contains(readinessState)) {
            return false;
        }
        String friendlyStatus = app.friendlyStatus() == null ? "" : app.friendlyStatus();
        return !List.of(AutarkOsStates.AppStatus.READY, AutarkOsStates.AppStatus.STARTING, AutarkOsStates.AppStatus.PAUSED).contains(friendlyStatus);
    }

    private boolean isFailedFullRestore(AutarkOsJob job) {
        return job != null
                && AutarkOsStates.JobType.BACKUP_RESTORE.equals(job.type())
                && AutarkOsStates.JobStatus.FAILED.equals(job.status())
                && "all".equals(restoreTarget(job.subjectId()));
    }

    private String operationKind(String type) {
        return switch (type) {
            case AutarkOsStates.JobType.START_APP -> AutarkOsStates.OperationKind.STARTING;
            case AutarkOsStates.JobType.STOP_APP -> AutarkOsStates.OperationKind.STOPPING;
            case AutarkOsStates.JobType.RESTART_APP -> AutarkOsStates.OperationKind.RESTARTING;
            case AutarkOsStates.JobType.REPAIR_APP -> AutarkOsStates.OperationKind.REPAIRING;
            case AutarkOsStates.JobType.SAVE_APP_SETTINGS -> "saving_settings";
            case AutarkOsStates.JobType.BACKUP, AutarkOsStates.JobType.BACKUP_VERIFY -> AutarkOsStates.OperationKind.BACKING_UP;
            case AutarkOsStates.JobType.BACKUP_RESTORE -> AutarkOsStates.OperationKind.RESTORING;
            case AutarkOsStates.JobType.UNINSTALL_APP -> AutarkOsStates.OperationKind.UNINSTALLING;
            case AutarkOsStates.JobType.UPDATE_APP -> AutarkOsStates.OperationKind.UPDATING;
            case AutarkOsStates.JobType.ROLLBACK_APP -> AutarkOsStates.OperationKind.ROLLING_BACK;
            default -> AutarkOsStates.OperationKind.IDLE;
        };
    }

    private String operationLabel(String type) {
        return switch (type) {
            case AutarkOsStates.JobType.START_APP -> "Starting";
            case AutarkOsStates.JobType.STOP_APP -> "Pausing";
            case AutarkOsStates.JobType.RESTART_APP -> "Restarting";
            case AutarkOsStates.JobType.REPAIR_APP -> "Repairing";
            case AutarkOsStates.JobType.SAVE_APP_SETTINGS -> "Saving settings";
            case AutarkOsStates.JobType.BACKUP, AutarkOsStates.JobType.BACKUP_VERIFY -> "Creating backup";
            case AutarkOsStates.JobType.BACKUP_RESTORE -> "Restoring";
            case AutarkOsStates.JobType.UNINSTALL_APP -> "Uninstalling safely";
            case AutarkOsStates.JobType.UPDATE_APP -> "Updating safely";
            case AutarkOsStates.JobType.ROLLBACK_APP -> "Restoring previous release";
            default -> "Working";
        };
    }

    private String failedOperationLabel(String type) {
        return switch (type) {
            case AutarkOsStates.JobType.START_APP -> "Start failed";
            case AutarkOsStates.JobType.STOP_APP -> "Pause failed";
            case AutarkOsStates.JobType.RESTART_APP -> "Restart failed";
            case AutarkOsStates.JobType.REPAIR_APP -> "Repair failed";
            case AutarkOsStates.JobType.SAVE_APP_SETTINGS -> "Settings change failed";
            case AutarkOsStates.JobType.BACKUP -> "Backup failed";
            case AutarkOsStates.JobType.BACKUP_VERIFY -> "Backup verification failed";
            case AutarkOsStates.JobType.BACKUP_RESTORE -> "Restore failed";
            case AutarkOsStates.JobType.UNINSTALL_APP -> "Uninstall failed";
            case AutarkOsStates.JobType.UPDATE_APP -> "Update failed";
            case AutarkOsStates.JobType.ROLLBACK_APP -> "Rollback failed";
            default -> "Action failed";
        };
    }

    private String currentStepText(AutarkOsJob job) {
        AutarkOsJobStep step = job.steps().stream()
                .filter(candidate -> candidate.id().equals(job.currentStep()))
                .findFirst()
                .orElseGet(() -> job.steps().stream()
                        .filter(candidate -> AutarkOsStates.JobStatus.RUNNING.equals(candidate.status()))
                        .findFirst()
                        .orElseGet(() -> job.steps().stream()
                                .filter(candidate -> AutarkOsStates.JobStatus.PENDING.equals(candidate.status()))
                                .findFirst()
                                .orElse(null)));
        if (step == null) {
            return "";
        }
        return step.message() == null || step.message().isBlank() ? step.label() : step.message();
    }

    private List<AutarkOsAction> availableActions(AppRuntimeView app, AppOperationView operation) {
        if (operation != null && !AutarkOsStates.OperationKind.IDLE.equals(operation.kind()) && !AutarkOsStates.OperationKind.FAILED.equals(operation.kind())) {
            return List.of();
        }
        return AppRuntimeView.defaultAvailableActions(app.appId(), app.friendlyStatus(), app.runtimePath(), repairRecommended(app));
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
        return List.of("Needs review", AutarkOsStates.AppStatus.UNAVAILABLE).contains(friendlyStatus);
    }

    private String managedSortName(AppRuntimeView app) {
        return app.appName() == null ? "" : app.appName().toLowerCase(java.util.Locale.ROOT);
    }

    private ApplicationState markFailed(ApplicationState previous, Instant startedAt, RuntimeException exception) {
        Instant completedAt = clock.get();
        return new ApplicationState(
                previous.applications(),
                previous.updatedAt(),
                AutarkOsStates.SnapshotState.ERROR,
                startedAt,
                completedAt,
                true,
                exception.getMessage() == null || exception.getMessage().isBlank() ? exception.getClass().getSimpleName() : exception.getMessage(),
                completedAt.plus(SNAPSHOT_REFRESH_INTERVAL));
    }

    private ApplicationState markRunning(ApplicationState previous, Instant startedAt) {
        return new ApplicationState(
                previous.applications(),
                previous.updatedAt(),
                AutarkOsStates.JobStatus.RUNNING,
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
                    Thread thread = new Thread(runnable, "autark-os-app-state-refresh");
                    thread.setDaemon(true);
                    return thread;
                },
                new ThreadPoolExecutor.AbortPolicy());
        executor.prestartAllCoreThreads();
        return executor;
    }
}
