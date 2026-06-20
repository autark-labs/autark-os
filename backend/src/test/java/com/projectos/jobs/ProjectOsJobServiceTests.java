package com.projectos.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class ProjectOsJobServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void coalescesDuplicateActiveInstallJobForSameApp() {
        ProjectOsJobService service = service();

        ProjectOsJob first = service.start("install_app", "vaultwarden", List.of(ProjectOsJobStep.pending("validate_host", "Checking this device")), () -> ProjectOsJobOutcome.succeeded("Installed."));
        ProjectOsJob second = service.start("install_app", "vaultwarden", List.of(ProjectOsJobStep.pending("validate_host", "Checking this device")), () -> ProjectOsJobOutcome.succeeded("Installed."));

        assertThat(second.jobId()).isEqualTo(first.jobId());
        assertThat(service.list()).hasSize(1);
        assertThat(service.findById(first.jobId()).orElseThrow().status()).isEqualTo("queued");
    }

    @Test
    void recordsSuccessfulRunWithOutcomeSteps() {
        ProjectOsJobService service = service();
        ProjectOsJob job = service.start("backup", "vaultwarden", List.of(ProjectOsJobStep.pending("backup", "Creating restore point")), () -> ProjectOsJobOutcome.succeeded(
                "Backup complete.",
                List.of(ProjectOsJobStep.succeeded("backup", "Creating restore point", "Restore point created."))));

        service.runQueuedJobsNow();

        ProjectOsJob completed = service.findById(job.jobId()).orElseThrow();
        assertThat(completed.status()).isEqualTo("succeeded");
        assertThat(completed.steps()).extracting(ProjectOsJobStep::status).containsExactly("succeeded");
    }

    @Test
    void recordsFailedRunWithSafeErrorPayload() {
        ProjectOsJobService service = service();
        ProjectOsJob job = service.start("install_app", "vaultwarden", List.of(ProjectOsJobStep.pending("start_app", "Starting app")), () -> {
            throw new IllegalStateException("Docker daemon is not reachable.");
        });

        service.runQueuedJobsNow();

        ProjectOsJob failed = service.findById(job.jobId()).orElseThrow();
        assertThat(failed.status()).isEqualTo("failed");
        assertThat(failed.error().code()).isEqualTo("job_failed");
        assertThat(failed.error().message()).isEqualTo("Docker daemon is not reachable.");
    }

    @Test
    void marksInterruptedQueuedAndRunningJobsAsFailedOnStartup() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        ProjectOsJobRepository repository = new ProjectOsJobRepository(new RuntimeLayout(properties), () -> Instant.parse("2026-06-20T12:00:00Z"));
        ProjectOsJobService previousProcess = new ProjectOsJobService(repository, Runnable::run, false);
        ProjectOsJob queued = previousProcess.start("install_app", "vaultwarden", List.of(ProjectOsJobStep.pending("download", "Downloading app")), () -> ProjectOsJobOutcome.succeeded("Installed."));
        ProjectOsJob running = previousProcess.start("backup", "vaultwarden", List.of(ProjectOsJobStep.pending("copy", "Copying app data")), () -> ProjectOsJobOutcome.succeeded("Backed up."));
        repository.markRunning(running.jobId(), "copy");

        ProjectOsJobService restarted = new ProjectOsJobService(repository, Runnable::run, false);
        restarted.reconcileInterruptedJobs();

        assertThat(restarted.findById(queued.jobId()).orElseThrow().status()).isEqualTo("failed");
        assertThat(restarted.findById(queued.jobId()).orElseThrow().error().code()).isEqualTo("job_interrupted");
        ProjectOsJob interruptedRunning = restarted.findById(running.jobId()).orElseThrow();
        assertThat(interruptedRunning.status()).isEqualTo("failed");
        assertThat(interruptedRunning.steps()).extracting(ProjectOsJobStep::status).containsExactly("failed");
        assertThat(interruptedRunning.error().message()).contains("interrupted");
    }

    @Test
    void recordsLiveProgressWhileJobIsRunning() {
        ProjectOsJobService service = service();
        ProjectOsJob job = service.start("install_app", "vaultwarden", List.of(ProjectOsJobStep.pending("validate_host", "Checking this device")), () -> ProjectOsJobOutcome.succeeded("Installed."));

        service.recordProgress(job.jobId(), List.of(ProjectOsJobStep.succeeded("prepare", "Preparing app", "Manifest validated.")));

        ProjectOsJob running = service.findById(job.jobId()).orElseThrow();
        assertThat(running.status()).isEqualTo("running");
        assertThat(running.currentStep()).isEqualTo("prepare");
        assertThat(running.steps()).extracting(ProjectOsJobStep::label).containsExactly("Preparing app");
    }

    private ProjectOsJobService service() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        ProjectOsJobRepository repository = new ProjectOsJobRepository(new RuntimeLayout(properties), () -> Instant.parse("2026-06-20T12:00:00Z"));
        return new ProjectOsJobService(repository, Runnable::run, false);
    }
}
