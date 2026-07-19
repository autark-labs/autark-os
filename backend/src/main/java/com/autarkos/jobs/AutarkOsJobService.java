package com.autarkos.jobs;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.function.Function;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsStates;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class AutarkOsJobService {

    private final AutarkOsJobRepository repository;
    private final Executor executor;
    // Install, update, and rollback all mutate a Compose project; keep them in one lane.
    private final Executor installationExecutor;
    private final boolean autoRun;
    private final boolean reconcileOnStartup;
    private final Supplier<Instant> clock;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ConcurrentHashMap<String, Runnable> queuedTasks = new ConcurrentHashMap<>();
    private final Object jobStartTransition = new Object();

    @Autowired
    public AutarkOsJobService(AutarkOsJobRepository repository, @Value("${autark-os.jobs.reconcile-on-startup:true}") boolean reconcileOnStartup) {
        this(repository, command -> Thread.ofVirtual().name("autark-os-job-", 0).start(command), true, Instant::now, reconcileOnStartup);
    }

    public AutarkOsJobService(AutarkOsJobRepository repository, Executor executor, boolean autoRun) {
        this(repository, executor, autoRun, Instant::now, true);
    }

    AutarkOsJobService(AutarkOsJobRepository repository, Executor executor, boolean autoRun, Supplier<Instant> clock) {
        this(repository, executor, autoRun, clock, true);
    }

    AutarkOsJobService(AutarkOsJobRepository repository, Executor executor, boolean autoRun, Supplier<Instant> clock, boolean reconcileOnStartup) {
        this.repository = repository;
        this.executor = executor;
        this.installationExecutor = new SerialExecutor(executor);
        this.autoRun = autoRun;
        this.clock = clock;
        this.reconcileOnStartup = reconcileOnStartup;
    }

    public AutarkOsJob start(String type, String subjectId, List<AutarkOsJobStep> steps, Supplier<AutarkOsJobOutcome> operation) {
        return startWithJob(type, subjectId, steps, ignored -> operation.get());
    }

    public AutarkOsJob startWithJob(String type, String subjectId, List<AutarkOsJobStep> steps, Function<AutarkOsJob, AutarkOsJobOutcome> operation) {
        Optional<AutarkOsJob> active = activeFor(type, subjectId);
        if (active.isPresent()) {
            return active.get();
        }
        AutarkOsJob job = create(type, subjectId, steps);
        Runnable task = () -> run(job, operation);
        queuedTasks.put(job.jobId(), task);
        if (autoRun) {
            schedule(job);
        }
        return job;
    }

    public List<AutarkOsJob> list() {
        return repository.recent(100).stream()
                .map(this::toDomain)
                .toList();
    }

    public Optional<AutarkOsJob> findById(String jobId) {
        return repository.findById(jobId).map(this::toDomain);
    }

    public AutarkOsJob recordProgress(String jobId, List<AutarkOsJobStep> steps) {
        String currentStep = steps == null || steps.isEmpty() ? currentStep(jobId) : steps.getLast().id();
        return update(jobId, "running", currentStep, steps == null ? List.of() : steps, null, null, Map.of());
    }

    public Optional<AutarkOsJob> cancel(String jobId) {
        synchronized (jobStartTransition) {
            Optional<AutarkOsJob> existing = findById(jobId);
            if (existing.isEmpty()) {
                return Optional.empty();
            }
            AutarkOsJob job = existing.get();
            if (terminalStatus(job.status())) {
                return Optional.of(job);
            }
            if (!AutarkOsStates.JobStatus.QUEUED.equals(job.status())) {
                throw new JobCancellationConflictException(job.status());
            }
            Runnable cancelledTask = queuedTasks.remove(jobId);
            if (cancelledTask == null) {
                throw new JobCancellationConflictException("starting");
            }
            return Optional.of(cancelJob(jobId));
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void reconcileInterruptedJobs() {
        if (!reconcileOnStartup) {
            return;
        }
        repository.activeJobs().stream().map(this::toDomain).forEach(job -> fail(
                job.jobId(),
                "job_interrupted",
                interruptedMessage(job),
                Map.of("previousStatus", job.status())));
    }

    public void runQueuedJobsNow() {
        List<AutarkOsJob> jobs = new ArrayList<>(queuedTasks.keySet()).stream()
                .map(this::findById)
                .flatMap(Optional::stream)
                .toList();
        jobs.forEach(this::schedule);
    }

    private void schedule(AutarkOsJob job) {
        Executor jobExecutor = usesInstallationLane(job.type())
                ? installationExecutor
                : executor;
        jobExecutor.execute(() -> {
            Runnable queued = claimQueuedTask(job);
            if (queued != null) {
                queued.run();
            }
        });
    }

    private Runnable claimQueuedTask(AutarkOsJob job) {
        synchronized (jobStartTransition) {
            Runnable queued = queuedTasks.remove(job.jobId());
            if (queued == null) {
                return null;
            }
            try {
                String firstStepId = job.steps().isEmpty() ? "" : job.steps().getFirst().id();
                markRunning(job.jobId(), firstStepId);
                return queued;
            } catch (RuntimeException exception) {
                fail(job.jobId(), "job_failed", safeMessage(exception), Map.of("exception", exception.getClass().getSimpleName()));
                return null;
            }
        }
    }

    private void run(AutarkOsJob job, Function<AutarkOsJob, AutarkOsJobOutcome> operation) {
        try {
            AutarkOsJobOutcome outcome = operation.apply(job);
            if ("failed".equals(outcome.status())) {
                fail(job.jobId(), "job_failed", outcome.message(), Map.of(), outcome.steps());
            } else {
                succeed(job.jobId(), outcome.message(), outcome.steps());
            }
        } catch (RuntimeException exception) {
            fail(job.jobId(), "job_failed", safeMessage(exception), Map.of("exception", exception.getClass().getSimpleName()));
        }
    }

    private Optional<AutarkOsJob> activeFor(String type, String subjectId) {
        return repository.activeFor(AutarkOsJobs.clean(type, "job"), AutarkOsJobs.blankToNull(subjectId))
                .map(this::toDomain);
    }

    private AutarkOsJob create(String type, String subjectId, List<AutarkOsJobStep> steps) {
        Instant now = clock.get();
        List<AutarkOsJobStep> safeSteps = steps == null ? List.of() : steps;
        String jobId = "job_" + UUID.randomUUID().toString().replace("-", "");
        String currentStep = safeSteps.isEmpty() ? "" : safeSteps.getFirst().id();
        AutarkOsJobEntity saved = repository.save(new AutarkOsJobEntity(
                jobId,
                AutarkOsJobs.clean(type, "job"),
                AutarkOsJobs.blankToNull(subjectId),
                "queued",
                currentStep,
                AutarkOsJobs.stepsJson(safeSteps, objectMapper),
                now.toString(),
                now.toString()));
        return toDomain(saved);
    }

    private AutarkOsJob markRunning(String jobId, String stepId) {
        return update(jobId, "running", stepId, markStep(jobId, stepId, "running", "Started.", true), null, null, Map.of());
    }

    private AutarkOsJob succeed(String jobId, String message, List<AutarkOsJobStep> steps) {
        List<AutarkOsJobStep> nextSteps = steps == null || steps.isEmpty() ? markAllPending(jobId, "succeeded", message) : steps;
        String currentStep = nextSteps.isEmpty() ? "" : nextSteps.getLast().id();
        return update(jobId, "succeeded", currentStep, nextSteps, null, null, Map.of());
    }

    private AutarkOsJob fail(String jobId, String code, String message, Map<String, String> details) {
        return update(jobId, "failed", currentStep(jobId), markRunningStepFailed(jobId, message), AutarkOsJobs.clean(code, "job_failed"), AutarkOsJobs.clean(message, "Job failed."), details == null ? Map.of() : details);
    }

    private AutarkOsJob fail(String jobId, String code, String message, Map<String, String> details, List<AutarkOsJobStep> steps) {
        if (steps == null || steps.isEmpty()) {
            return fail(jobId, code, message, details);
        }
        return update(jobId, "failed", failedStepId(steps), steps, AutarkOsJobs.clean(code, "job_failed"), AutarkOsJobs.clean(message, "Job failed."), details == null ? Map.of() : details);
    }

    private AutarkOsJob cancelJob(String jobId) {
        return update(jobId, "cancelled", currentStep(jobId), findById(jobId).orElseThrow().steps(), null, null, Map.of());
    }

    private AutarkOsJob update(String jobId, String status, String currentStep, List<AutarkOsJobStep> steps, String errorCode, String errorMessage, Map<String, String> errorDetails) {
        AutarkOsJobEntity entity = repository.findById(jobId).orElseThrow();
        entity.update(
                status,
                currentStep,
                AutarkOsJobs.stepsJson(steps, objectMapper),
                errorCode,
                errorMessage,
                AutarkOsJobs.errorDetailsJson(errorDetails, objectMapper),
                clock.get().toString());
        return toDomain(repository.save(entity));
    }

    private List<AutarkOsJobStep> markStep(String jobId, String stepId, String status, String message, boolean started) {
        Instant now = clock.get();
        return findById(jobId).orElseThrow().steps().stream()
                .map(step -> step.id().equals(stepId) ? step.withStatus(status, message, started ? now : null, "succeeded".equals(status) || "failed".equals(status) ? now : null) : step)
                .toList();
    }

    private List<AutarkOsJobStep> markAllPending(String jobId, String status, String message) {
        Instant now = clock.get();
        return findById(jobId).orElseThrow().steps().stream()
                .map(step -> "pending".equals(step.status()) ? step.withStatus(status, message, null, now) : step)
                .toList();
    }

    private List<AutarkOsJobStep> markRunningStepFailed(String jobId, String message) {
        Instant now = clock.get();
        return findById(jobId).orElseThrow().steps().stream()
                .map(step -> "running".equals(step.status()) ? step.withStatus("failed", message, null, now) : step)
                .toList();
    }

    private String failedStepId(List<AutarkOsJobStep> steps) {
        return steps.stream()
                .filter(step -> "failed".equals(step.status()))
                .map(AutarkOsJobStep::id)
                .findFirst()
                .orElseGet(() -> steps.isEmpty() ? "" : steps.getLast().id());
    }

    private String currentStep(String jobId) {
        return findById(jobId).map(AutarkOsJob::currentStep).orElse("");
    }

    private AutarkOsJob toDomain(AutarkOsJobEntity entity) {
        return AutarkOsJobs.toDomain(entity, objectMapper);
    }

    private String interruptedMessage(AutarkOsJob job) {
        return switch (job.type()) {
            case AutarkOsStates.JobType.INSTALL_APP -> "This app install was interrupted when Autark-OS stopped. Review My Apps, then retry the install if needed.";
            case AutarkOsStates.JobType.UPDATE_APP -> "This app update was interrupted when Autark-OS stopped. Review My Apps and roll back the saved release before trying again.";
            case AutarkOsStates.JobType.ROLLBACK_APP -> "This app rollback was interrupted when Autark-OS stopped. Review My Apps before starting another release action.";
            case "backup" -> "This backup was interrupted when Autark-OS stopped. Rerun the backup to create a fresh restore point.";
            default -> "This job was interrupted when Autark-OS stopped. Start it again if it is still needed.";
        };
    }

    private boolean usesInstallationLane(String type) {
        return List.of(
                AutarkOsStates.JobType.INSTALL_APP,
                AutarkOsStates.JobType.UPDATE_APP,
                AutarkOsStates.JobType.ROLLBACK_APP).contains(type);
    }

    private String safeMessage(RuntimeException exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Autark-OS could not finish this job."
                : exception.getMessage();
    }

    private boolean terminalStatus(String status) {
        return AutarkOsStates.JobStatus.SUCCEEDED.equals(status)
                || AutarkOsStates.JobStatus.FAILED.equals(status)
                || AutarkOsStates.JobStatus.CANCELLED.equals(status)
                || AutarkOsStates.JobStatus.CANCELED.equals(status);
    }

    private static final class SerialExecutor implements Executor {

        private final Executor delegate;
        private final Queue<Runnable> tasks = new ArrayDeque<>();
        private Runnable activeTask;

        private SerialExecutor(Executor delegate) {
            this.delegate = delegate;
        }

        @Override
        public synchronized void execute(Runnable command) {
            tasks.add(() -> {
                try {
                    command.run();
                } finally {
                    scheduleNext();
                }
            });
            if (activeTask == null) {
                scheduleNext();
            }
        }

        private synchronized void scheduleNext() {
            activeTask = tasks.poll();
            if (activeTask != null) {
                delegate.execute(activeTask);
            }
        }
    }
}
