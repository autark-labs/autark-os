package com.projectos.apps;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
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

import com.projectos.host.ObservedService;
import com.projectos.host.ObservedServiceService;
import com.projectos.host.ObservedServiceView;
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
            AppOwnershipService appOwnershipService) {
        this(
                appInstanceViewProvider::list,
                appLifecycleService::listApps,
                observedServiceService,
                appOwnershipService,
                Instant::now,
                defaultBackgroundRefreshExecutor(),
                true);
    }

    public ApplicationStateService(
            Supplier<List<AppInstanceView>> managedApps,
            Supplier<List<AppRuntimeView>> runtimeApps,
            ObservedServiceService observedServiceService,
            AppOwnershipService appOwnershipService,
            Supplier<Instant> clock) {
        this(managedApps, runtimeApps, observedServiceService, appOwnershipService, clock, Runnable::run, false);
    }

    public ApplicationStateService(
            Supplier<List<AppInstanceView>> managedApps,
            Supplier<List<AppRuntimeView>> runtimeApps,
            ObservedServiceService observedServiceService,
            AppOwnershipService appOwnershipService,
            Supplier<Instant> clock,
            Executor backgroundRefreshExecutor) {
        this(managedApps, runtimeApps, observedServiceService, appOwnershipService, clock, backgroundRefreshExecutor, false);
    }

    private ApplicationStateService(
            Supplier<List<AppInstanceView>> managedApps,
            Supplier<List<AppRuntimeView>> runtimeApps,
            ObservedServiceService observedServiceService,
            AppOwnershipService appOwnershipService,
            Supplier<Instant> clock,
            Executor backgroundRefreshExecutor,
            boolean ownsBackgroundRefreshExecutor) {
        this.managedApps = managedApps;
        this.runtimeApps = runtimeApps;
        this.observedServiceService = observedServiceService;
        this.appOwnershipService = appOwnershipService;
        this.clock = clock;
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
        List<AppRuntimeView> runtime = runtimeApps.get();
        List<ObservedService> observed = refreshObservedServices();
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

    private List<ObservedService> refreshObservedServices() {
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
