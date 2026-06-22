package com.projectos.apps;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.host.ObservedServiceRepository;
import com.projectos.host.ObservedServiceScanner;
import com.projectos.host.ObservedServiceService;
import com.projectos.host.ObservedServiceView;
import com.projectos.marketplace.install.AppInstanceView;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

import java.nio.file.Path;

class ApplicationStateServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void snapshotIncludesEveryPinnedObservedServiceEvenWithoutCatalogMatch() {
        ObservedServiceRepository repository = repository();
        repository.upsert(pinned("manual:gitlab", "gitlab"));
        repository.upsert(pinned("docker:compassionate_mclean", "compassionate_mclean"));
        repository.upsert(found("docker:vaultwarden", "vaultwarden"));
        ObservedServiceService observedServiceService = new ObservedServiceService(repository, noScan());
        ApplicationStateService service = new ApplicationStateService(
                List::of,
                List::of,
                observedServiceService,
                null,
                Instant::now);

        ApplicationState state = service.refreshNow();

        assertThat(state.pinnedExternalServices())
                .extracting(ObservedServiceView::id)
                .containsExactlyInAnyOrder("manual:gitlab", "docker:compassionate_mclean");
    }

    @Test
    void snapshotDoesNotRunLiveSuppliers() {
        AtomicInteger managedCalls = new AtomicInteger();
        ApplicationStateService service = new ApplicationStateService(
                () -> {
                    managedCalls.incrementAndGet();
                    return List.of(appInstance());
                },
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        service.snapshot();
        service.snapshot();

        assertThat(managedCalls).hasValue(0);
        assertThat(service.snapshot().refreshStatus()).isEqualTo("stale");
    }

    @Test
    void explicitRefreshBuildsAndCachesProjection() {
        AtomicInteger managedCalls = new AtomicInteger();
        ApplicationStateService service = new ApplicationStateService(
                () -> {
                    managedCalls.incrementAndGet();
                    return List.of(appInstance());
                },
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"));

        ApplicationState refreshed = service.refreshNow();
        ApplicationState cached = service.snapshot();

        assertThat(managedCalls).hasValue(1);
        assertThat(refreshed.managedApps()).hasSize(1);
        assertThat(cached).isSameAs(refreshed);
        assertThat(cached.refreshStatus()).isEqualTo("idle");
        assertThat(cached.stale()).isFalse();
    }

    @Test
    void snapshotDuringRefreshReturnsPreviousProjectionWithoutWaiting() throws Exception {
        CountDownLatch refreshStarted = new CountDownLatch(1);
        CountDownLatch releaseRefresh = new CountDownLatch(1);
        AtomicReference<List<AppInstanceView>> managed = new AtomicReference<>(List.of(appInstance()));
        ApplicationStateService service = new ApplicationStateService(
                () -> managed.get(),
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"));
        ApplicationState previous = service.refreshNow();
        managed.set(List.of(blockingAppInstance(refreshStarted, releaseRefresh)));

        Thread refreshThread = new Thread(service::refreshNow);
        refreshThread.start();

        assertThat(refreshStarted.await(2, TimeUnit.SECONDS)).isTrue();
        ApplicationState duringRefresh = service.snapshot();
        releaseRefresh.countDown();
        refreshThread.join(2_000);

        assertThat(duringRefresh).isSameAs(previous);
        assertThat(service.snapshot().managedApps())
                .extracting(AppInstanceView::catalogAppId)
                .containsExactly("vaultwarden");
    }

    @Test
    void backgroundRefreshUsesProvidedExecutorInsteadOfRunningInline() {
        AtomicInteger managedCalls = new AtomicInteger();
        RecordingExecutor executor = new RecordingExecutor();
        ApplicationStateService service = new ApplicationStateService(
                () -> {
                    managedCalls.incrementAndGet();
                    return List.of(appInstance());
                },
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                executor);

        service.refreshInBackground();

        assertThat(executor.tasks).hasSize(1);
        assertThat(managedCalls).hasValue(0);

        executor.runNext();

        assertThat(managedCalls).hasValue(1);
        assertThat(service.snapshot().refreshStatus()).isEqualTo("idle");
    }

    @Test
    void backgroundRefreshRequestsCoalesceWhileQueued() {
        AtomicInteger managedCalls = new AtomicInteger();
        RecordingExecutor executor = new RecordingExecutor();
        ApplicationStateService service = new ApplicationStateService(
                () -> {
                    managedCalls.incrementAndGet();
                    return List.of(appInstance());
                },
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                executor);

        service.refreshInBackground();
        service.refreshInBackground();
        service.refreshInBackground();

        assertThat(executor.tasks).hasSize(1);

        executor.runNext();

        assertThat(managedCalls).hasValue(1);
    }

    @Test
    void backgroundRefreshMarksCachedProjectionAsRunningWhileQueued() {
        RecordingExecutor executor = new RecordingExecutor();
        ApplicationStateService service = new ApplicationStateService(
                () -> List.of(appInstance()),
                List::of,
                new ObservedServiceService(repository(), noScan()),
                null,
                () -> Instant.parse("2026-06-21T12:00:00Z"),
                executor);
        ApplicationState previous = service.refreshNow();

        service.refreshInBackground();

        ApplicationState queued = service.snapshot();
        assertThat(queued.managedApps()).isEqualTo(previous.managedApps());
        assertThat(queued.refreshStatus()).isEqualTo("running");
        assertThat(queued.stale()).isTrue();
        assertThat(queued.refreshStartedAt()).isEqualTo(Instant.parse("2026-06-21T12:00:00Z"));

        executor.runNext();

        assertThat(service.snapshot().refreshStatus()).isEqualTo("idle");
        assertThat(service.snapshot().stale()).isFalse();
    }

    private ObservedServiceScanner noScan() {
        return new ObservedServiceScanner(List::of, () -> new com.projectos.system.ProjectOsIdentity("", "project-os", "", "", Instant.EPOCH, 1));
    }

    private com.projectos.host.ObservedService pinned(String id, String name) {
        return service(id, name, "pinned");
    }

    private com.projectos.host.ObservedService found(String id, String name) {
        return service(id, name, "visible");
    }

    private com.projectos.host.ObservedService service(String id, String name, String visibility) {
        return new com.projectos.host.ObservedService(
                id,
                "docker",
                id,
                name,
                null,
                "External",
                "LAN",
                null,
                "unknown",
                "external",
                visibility,
                "running",
                false,
                "",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z"),
                "pinned".equals(visibility) ? Instant.parse("2026-06-21T12:00:00Z") : null,
                null,
                "{}");
    }

    private AppInstanceView appInstance() {
        return new AppInstanceView(
                "appinst_homepage",
                "homepage",
                "Homepage",
                "Dashboards",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                "local_ready",
                "backup_disabled",
                "http://localhost:3005",
                null,
                List.of(),
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z"));
    }

    private AppInstanceView blockingAppInstance(CountDownLatch started, CountDownLatch release) {
        started.countDown();
        try {
            release.await(2, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
        return new AppInstanceView(
                "appinst_vaultwarden",
                "vaultwarden",
                "Vaultwarden",
                "Security",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                "local_ready",
                "backup_disabled",
                "http://localhost:3006",
                null,
                List.of(),
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z"));
    }

    private ObservedServiceRepository repository() {
        return new ObservedServiceRepository(runtimeLayout());
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static final class RecordingExecutor implements java.util.concurrent.Executor {
        private final List<Runnable> tasks = new ArrayList<>();

        @Override
        public void execute(Runnable command) {
            tasks.add(command);
        }

        private void runNext() {
            tasks.removeFirst().run();
        }
    }
}
