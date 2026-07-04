package com.autarkos.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

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

    private AutarkOsJobService service() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        AutarkOsJobRepository repository = JpaTestRepositories.jobRepository(new RuntimeLayout(properties));
        return new AutarkOsJobService(repository, Runnable::run, false, () -> Instant.parse("2026-06-20T12:00:00Z"));
    }
}
