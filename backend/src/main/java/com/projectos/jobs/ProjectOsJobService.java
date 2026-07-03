package com.projectos.jobs;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.function.Function;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

@Service
public class ProjectOsJobService {

    private final ProjectOsJobRepository repository;
    private final Executor executor;
    private final boolean autoRun;
    private final ConcurrentHashMap<String, Runnable> queuedTasks = new ConcurrentHashMap<>();

    @Autowired
    public ProjectOsJobService(ProjectOsJobRepository repository) {
        this(repository, command -> Thread.ofVirtual().name("project-os-job-", 0).start(command), true);
    }

    public ProjectOsJobService(ProjectOsJobRepository repository, Executor executor, boolean autoRun) {
        this.repository = repository;
        this.executor = executor;
        this.autoRun = autoRun;
    }

    public ProjectOsJob start(String type, String subjectId, List<ProjectOsJobStep> steps, Supplier<ProjectOsJobOutcome> operation) {
        return startWithJob(type, subjectId, steps, ignored -> operation.get());
    }

    public ProjectOsJob startWithJob(String type, String subjectId, List<ProjectOsJobStep> steps, Function<ProjectOsJob, ProjectOsJobOutcome> operation) {
        Optional<ProjectOsJob> active = repository.activeFor(type, subjectId);
        if (active.isPresent()) {
            return active.get();
        }
        ProjectOsJob job = repository.create(type, subjectId, steps);
        Runnable task = () -> run(job, operation);
        queuedTasks.put(job.jobId(), task);
        if (autoRun) {
            executor.execute(() -> {
                Runnable queued = queuedTasks.remove(job.jobId());
                if (queued != null) {
                    queued.run();
                }
            });
        }
        return job;
    }

    public List<ProjectOsJob> list() {
        return repository.list(100);
    }

    public Optional<ProjectOsJob> findById(String jobId) {
        return repository.findById(jobId);
    }

    public ProjectOsJob recordProgress(String jobId, List<ProjectOsJobStep> steps) {
        return repository.recordProgress(jobId, steps);
    }

    public Optional<ProjectOsJob> cancel(String jobId) {
        queuedTasks.remove(jobId);
        return repository.findById(jobId).map(job -> {
            if ("succeeded".equals(job.status()) || "failed".equals(job.status()) || "cancelled".equals(job.status())) {
                return job;
            }
            return repository.cancel(jobId);
        });
    }

    @EventListener(ApplicationReadyEvent.class)
    public void reconcileInterruptedJobs() {
        repository.activeJobs().forEach(job -> repository.fail(
                job.jobId(),
                "job_interrupted",
                interruptedMessage(job),
                java.util.Map.of("previousStatus", job.status())));
    }

    public void runQueuedJobsNow() {
        List<Runnable> tasks = new ArrayList<>(queuedTasks.values());
        queuedTasks.clear();
        tasks.forEach(Runnable::run);
    }

    private void run(ProjectOsJob job, Function<ProjectOsJob, ProjectOsJobOutcome> operation) {
        try {
            String firstStepId = job.steps().isEmpty() ? "" : job.steps().getFirst().id();
            repository.markRunning(job.jobId(), firstStepId);
            ProjectOsJobOutcome outcome = operation.apply(job);
            if ("failed".equals(outcome.status())) {
                repository.fail(job.jobId(), "job_failed", outcome.message(), java.util.Map.of(), outcome.steps());
            } else {
                repository.succeed(job.jobId(), outcome.message(), outcome.steps());
            }
        } catch (RuntimeException exception) {
            repository.fail(job.jobId(), "job_failed", safeMessage(exception), java.util.Map.of("exception", exception.getClass().getSimpleName()));
        }
    }

    private String interruptedMessage(ProjectOsJob job) {
        return switch (job.type()) {
            case "install_app" -> "This app install was interrupted when Autark-OS stopped. Review My Apps, then retry the install if needed.";
            case "backup" -> "This backup was interrupted when Autark-OS stopped. Rerun the backup to create a fresh restore point.";
            default -> "This job was interrupted when Autark-OS stopped. Start it again if it is still needed.";
        };
    }

    private String safeMessage(RuntimeException exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Autark-OS could not finish this job."
                : exception.getMessage();
    }
}
