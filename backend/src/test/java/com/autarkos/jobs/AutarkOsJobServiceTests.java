package com.autarkos.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class AutarkOsJobServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void coalescesDuplicateActiveInstallJobForSameApp() {
        AutarkOsJobService service = service();

        AutarkOsJob first = service.start("install_app", "vaultwarden", List.of(AutarkOsJobStep.pending("validate_host", "Checking this device")), () -> AutarkOsJobOutcome.succeeded("Installed."));
        AutarkOsJob second = service.start("install_app", "vaultwarden", List.of(AutarkOsJobStep.pending("validate_host", "Checking this device")), () -> AutarkOsJobOutcome.succeeded("Installed."));

        assertThat(second.jobId()).isEqualTo(first.jobId());
        assertThat(service.list()).hasSize(1);
        assertThat(service.findById(first.jobId()).orElseThrow().status()).isEqualTo("queued");
    }

    @Test
    void concurrentDuplicateProChangesCollapseIntoOneDurableJob()
            throws Exception {
        AutarkOsJobService service = service();
        ExecutorService callers = Executors.newFixedThreadPool(8);
        CountDownLatch ready = new CountDownLatch(8);
        CountDownLatch start = new CountDownLatch(1);
        var jobIds = ConcurrentHashMap.<String>newKeySet();
        try {
            var futures = IntStream.range(0, 8)
                    .mapToObj(index -> callers.submit(() -> {
                        ready.countDown();
                        await(start);
                        jobIds.add(service.start(
                                "pro_module_change",
                                "autark-pro-agent",
                                List.of(AutarkOsJobStep.pending(
                                        "check_release",
                                        "Check assigned release")),
                                () -> AutarkOsJobOutcome.succeeded(
                                        "Checked."))
                                .jobId());
                    }))
                    .toList();
            assertThat(ready.await(2, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            for (var future : futures) {
                future.get(2, TimeUnit.SECONDS);
            }
        } finally {
            start.countDown();
            callers.shutdownNow();
        }

        assertThat(jobIds).hasSize(1);
        assertThat(service.list()).hasSize(1);
    }

    @Test
    void serializesInstallJobsForDifferentAppsWithoutHoldingBackOtherJobTypes() {
        RecordingExecutor executor = new RecordingExecutor();
        AutarkOsJobService service = service(executor, true);
        List<String> completedOperations = new ArrayList<>();

        AutarkOsJob firstInstall = service.start(
                AutarkOsStates.JobType.INSTALL_APP,
                "vaultwarden",
                List.of(AutarkOsJobStep.pending("start_app", "Starting Vaultwarden")),
                () -> {
                    completedOperations.add("vaultwarden");
                    return AutarkOsJobOutcome.succeeded("Vaultwarden installed.");
                });
        AutarkOsJob secondInstall = service.start(
                AutarkOsStates.JobType.INSTALL_APP,
                "jellyfin",
                List.of(AutarkOsJobStep.pending("start_app", "Starting Jellyfin")),
                () -> {
                    completedOperations.add("jellyfin");
                    return AutarkOsJobOutcome.succeeded("Jellyfin installed.");
                });
        AutarkOsJob backup = service.start(
                AutarkOsStates.JobType.BACKUP,
                "homepage",
                List.of(AutarkOsJobStep.pending("backup", "Creating restore point")),
                () -> {
                    completedOperations.add("backup");
                    return AutarkOsJobOutcome.succeeded("Backup complete.");
                });

        assertThat(executor.queuedTaskCount()).isEqualTo(2);
        assertThat(service.findById(firstInstall.jobId()).orElseThrow().status()).isEqualTo("queued");
        assertThat(service.findById(secondInstall.jobId()).orElseThrow().status()).isEqualTo("queued");

        executor.runNext();

        assertThat(completedOperations).containsExactly("vaultwarden");
        assertThat(service.findById(firstInstall.jobId()).orElseThrow().status()).isEqualTo("succeeded");
        assertThat(service.findById(secondInstall.jobId()).orElseThrow().status()).isEqualTo("queued");
        assertThat(executor.queuedTaskCount()).isEqualTo(2);

        executor.runNext();
        executor.runNext();

        assertThat(completedOperations).containsExactly("vaultwarden", "backup", "jellyfin");
        assertThat(service.findById(secondInstall.jobId()).orElseThrow().status()).isEqualTo("succeeded");
        assertThat(service.findById(backup.jobId()).orElseThrow().status()).isEqualTo("succeeded");
    }

    @Test
    void cancelledInstallDoesNotRunAfterWaitingForAnotherAppInstall() {
        RecordingExecutor executor = new RecordingExecutor();
        AutarkOsJobService service = service(executor, true);
        List<String> completedInstalls = new ArrayList<>();

        service.start(
                AutarkOsStates.JobType.INSTALL_APP,
                "vaultwarden",
                List.of(AutarkOsJobStep.pending("start_app", "Starting Vaultwarden")),
                () -> {
                    completedInstalls.add("vaultwarden");
                    return AutarkOsJobOutcome.succeeded("Vaultwarden installed.");
                });
        AutarkOsJob waitingInstall = service.start(
                AutarkOsStates.JobType.INSTALL_APP,
                "jellyfin",
                List.of(AutarkOsJobStep.pending("start_app", "Starting Jellyfin")),
                () -> {
                    completedInstalls.add("jellyfin");
                    return AutarkOsJobOutcome.succeeded("Jellyfin installed.");
                });

        service.cancel(waitingInstall.jobId());
        executor.runNext();
        executor.runNext();

        assertThat(completedInstalls).containsExactly("vaultwarden");
        assertThat(service.findById(waitingInstall.jobId()).orElseThrow().status()).isEqualTo("cancelled");
    }

    @Test
    void rejectsCancellationAfterOperationStartsAndPreservesItsFinalOutcome() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        CountDownLatch operationStarted = new CountDownLatch(1);
        CountDownLatch releaseOperation = new CountDownLatch(1);
        try {
            AutarkOsJobService service = service(executor, true);
            AutarkOsJob job = service.start(
                    AutarkOsStates.JobType.BACKUP,
                    "vaultwarden",
                    List.of(AutarkOsJobStep.pending("backup", "Creating restore point")),
                    () -> {
                        operationStarted.countDown();
                        await(releaseOperation);
                        return AutarkOsJobOutcome.succeeded("Backup complete.");
                    });

            assertThat(operationStarted.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(service.findById(job.jobId()).orElseThrow().status()).isEqualTo("running");
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.cancel(job.jobId()))
                    .isInstanceOf(JobCancellationConflictException.class)
                    .hasMessageContaining("cannot be cancelled safely");
            assertThat(service.findById(job.jobId()).orElseThrow().status()).isEqualTo("running");

            releaseOperation.countDown();
            executor.shutdown();
            assertThat(executor.awaitTermination(2, TimeUnit.SECONDS)).isTrue();
            assertThat(service.findById(job.jobId()).orElseThrow().status()).isEqualTo("succeeded");
        } finally {
            releaseOperation.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void cancellationOfTerminalJobReturnsExistingOutcome() {
        AutarkOsJobService service = service();
        AutarkOsJob job = service.start(
                AutarkOsStates.JobType.BACKUP,
                "vaultwarden",
                List.of(AutarkOsJobStep.pending("backup", "Creating restore point")),
                () -> AutarkOsJobOutcome.succeeded("Backup complete."));

        service.runQueuedJobsNow();
        AutarkOsJob completed = service.findById(job.jobId()).orElseThrow();
        AutarkOsJob result = service.cancel(job.jobId()).orElseThrow();

        assertThat(result.status()).isEqualTo("succeeded");
        assertThat(result.updatedAt()).isEqualTo(completed.updatedAt());
    }

    @Test
    void recordsSuccessfulRunWithOutcomeSteps() {
        AutarkOsJobService service = service();
        AutarkOsJob job = service.start("backup", "vaultwarden", List.of(AutarkOsJobStep.pending("backup", "Creating restore point")), () -> AutarkOsJobOutcome.succeeded(
                "Backup complete.",
                List.of(AutarkOsJobStep.succeeded("backup", "Creating restore point", "Restore point created."))));

        service.runQueuedJobsNow();

        AutarkOsJob completed = service.findById(job.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("succeeded");
        assertThat(completed.steps()).extracting(AutarkOsJobStep::status).containsExactly("succeeded");
    }

    @Test
    void recordsFailedRunWithSafeErrorPayload() {
        AutarkOsJobService service = service();
        AutarkOsJob job = service.start("install_app", "vaultwarden", List.of(AutarkOsJobStep.pending("start_app", "Starting app")), () -> {
            throw new IllegalStateException("Docker daemon is not reachable.");
        });

        service.runQueuedJobsNow();

        AutarkOsJob failed = service.findById(job.jobId()).orElseThrow();
        assertThat(failed.status()).isEqualTo("failed");
        assertThat(failed.error().code()).isEqualTo("job_failed");
        assertThat(failed.error().message()).isEqualTo("Docker daemon is not reachable.");
    }

    @Test
    void failedOutcomePreservesOutcomeSteps() {
        AutarkOsJobService service = service();
        AutarkOsJob job = service.start("backup_restore", "42:vaultwarden", List.of(
                AutarkOsJobStep.pending("validate_restore_point", "Validating restore point"),
                AutarkOsJobStep.pending("restore_data", "Restoring app data"),
                AutarkOsJobStep.pending("finish", "Finishing restore")), () -> AutarkOsJobOutcome.failed(
                "Restore archive could not be read.",
                List.of(
                        AutarkOsJobStep.succeeded("validate_restore_point", "Validating restore point", "Restore point is ready."),
                        AutarkOsJobStep.failed("restore_data", "Restoring app data", "Restore archive could not be read."),
                        AutarkOsJobStep.pending("finish", "Finishing restore"))));

        service.runQueuedJobsNow();

        AutarkOsJob failed = service.findById(job.jobId()).orElseThrow();
        assertThat(failed.status()).isEqualTo("failed");
        assertThat(failed.currentStep()).isEqualTo("restore_data");
        assertThat(failed.steps()).extracting(AutarkOsJobStep::status)
                .containsExactly("succeeded", "failed", "pending");
        assertThat(failed.error().message()).isEqualTo("Restore archive could not be read.");
    }

    @Test
    void marksInterruptedQueuedAndRunningJobsAsFailedOnStartup() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        AutarkOsJobRepository repository = JpaTestRepositories.jobRepository(new RuntimeLayout(properties));
        AutarkOsJobService previousProcess = new AutarkOsJobService(repository, Runnable::run, false);
        AutarkOsJob queued = previousProcess.start("install_app", "vaultwarden", List.of(AutarkOsJobStep.pending("download", "Downloading app")), () -> AutarkOsJobOutcome.succeeded("Installed."));
        AutarkOsJob running = previousProcess.start("backup", "vaultwarden", List.of(AutarkOsJobStep.pending("copy", "Copying app data")), () -> AutarkOsJobOutcome.succeeded("Backed up."));
        previousProcess.recordProgress(running.jobId(), List.of(AutarkOsJobStep.running("copy", "Copying app data", "Copying app data.")));

        AutarkOsJobService restarted = new AutarkOsJobService(repository, Runnable::run, false);
        restarted.reconcileInterruptedJobs();

        assertThat(restarted.findById(queued.jobId()).orElseThrow().status()).isEqualTo("failed");
        assertThat(restarted.findById(queued.jobId()).orElseThrow().error().code()).isEqualTo("job_interrupted");
        AutarkOsJob interruptedRunning = restarted.findById(running.jobId()).orElseThrow();
        assertThat(interruptedRunning.status()).isEqualTo("failed");
        assertThat(interruptedRunning.steps()).extracting(AutarkOsJobStep::status).containsExactly("failed");
        assertThat(interruptedRunning.error().message()).contains("interrupted");
    }

    @Test
    void recordsLiveProgressWhileJobIsRunning() {
        AutarkOsJobService service = service();
        AutarkOsJob job = service.start("install_app", "vaultwarden", List.of(AutarkOsJobStep.pending("validate_host", "Checking this device")), () -> AutarkOsJobOutcome.succeeded("Installed."));

        service.recordProgress(job.jobId(), List.of(AutarkOsJobStep.succeeded("prepare", "Preparing app", "Manifest validated.")));

        AutarkOsJob running = service.findById(job.jobId()).orElseThrow();
        assertThat(running.status()).isEqualTo("running");
        assertThat(running.currentStep()).isEqualTo("prepare");
        assertThat(running.steps()).extracting(AutarkOsJobStep::label).containsExactly("Preparing app");
    }

    @Test
    void liveProgressSelectsTheRunningOrNextPendingStep() {
        AutarkOsJobService service = service();
        AutarkOsJob job = service.start(
                "pro_module_change",
                "autark-pro-agent",
                List.of(
                        AutarkOsJobStep.pending(
                                "download",
                                "Download image"),
                        AutarkOsJobStep.pending(
                                "verify",
                                "Verify image"),
                        AutarkOsJobStep.pending(
                                "activate",
                                "Activate image")),
                () -> AutarkOsJobOutcome.succeeded("Installed."));

        AutarkOsJob downloading = service.recordProgress(
                job.jobId(),
                List.of(
                        AutarkOsJobStep.running(
                                "download",
                                "Download image",
                                "Downloading."),
                        AutarkOsJobStep.pending(
                                "verify",
                                "Verify image"),
                        AutarkOsJobStep.pending(
                                "activate",
                                "Activate image")));
        assertThat(downloading.currentStep())
                .isEqualTo("download");

        AutarkOsJob betweenSteps = service.recordProgress(
                job.jobId(),
                List.of(
                        AutarkOsJobStep.succeeded(
                                "download",
                                "Download image",
                                "Downloaded."),
                        AutarkOsJobStep.pending(
                                "verify",
                                "Verify image"),
                        AutarkOsJobStep.pending(
                                "activate",
                                "Activate image")));
        assertThat(betweenSteps.currentStep())
                .isEqualTo("verify");
    }

    private AutarkOsJobService service() {
        return service(Runnable::run, false);
    }

    private AutarkOsJobService service(Executor executor, boolean autoRun) {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        AutarkOsJobRepository repository = JpaTestRepositories.jobRepository(new RuntimeLayout(properties));
        return new AutarkOsJobService(repository, executor, autoRun, () -> Instant.parse("2026-06-20T12:00:00Z"));
    }

    private static final class RecordingExecutor implements Executor {

        private final Queue<Runnable> tasks = new ArrayDeque<>();

        @Override
        public void execute(Runnable command) {
            tasks.add(command);
        }

        private int queuedTaskCount() {
            return tasks.size();
        }

        private void runNext() {
            tasks.remove().run();
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting for the test operation to continue.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for the test operation.", exception);
        }
    }
}
