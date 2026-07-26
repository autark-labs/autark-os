package com.autarkos.system;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * CE-side adapter for managed release discovery and the root-owned typed
 * update helper. The browser chooses when to install an already published
 * release; it cannot supply a file, path, URL, command, or approval token.
 */
@Service
public class CoreUpdateService {

    static final String JOB_TYPE = "core_update";
    static final String JOB_SUBJECT = "autark-os";
    static final Duration HELPER_TIMEOUT = Duration.ofSeconds(45);
    static final Duration UPDATE_START_TIMEOUT = Duration.ofSeconds(30);

    private final RuntimeLayout runtimeLayout;
    private final AutarkOsJobService jobs;
    private final HelperRunner helper;
    private final ReleaseSource releases;
    private final ObjectMapper objectMapper;

    @Autowired
    public CoreUpdateService(
            RuntimeLayout runtimeLayout,
            AutarkOsJobService jobs,
            SystemCommandRunner commandRunner,
            CoreUpdateReleaseClient releases,
            @Value("${autark-os.core-update.helper:/opt/autark-os/bin/autark-os-update-helper}")
                    String helperPath) {
        this(runtimeLayout, jobs, new ProcessHelperRunner(commandRunner, helperPath), releases,
                new ObjectMapper());
    }

    CoreUpdateService(
            RuntimeLayout runtimeLayout,
            AutarkOsJobService jobs,
            HelperRunner helper,
            ReleaseSource releases,
            ObjectMapper objectMapper) {
        this.runtimeLayout = runtimeLayout;
        this.jobs = jobs;
        this.helper = helper;
        this.releases = releases;
        this.objectMapper = objectMapper;
    }

    public CoreUpdateModels.Status status() {
        ReleaseContext context = releases.context();
        try {
            CoreUpdateModels.Status current = invoke("status", List.of(), HELPER_TIMEOUT);
            invoke("health", List.of(), HELPER_TIMEOUT);
            return contextualize(current, context, null);
        } catch (CoreUpdateException exception) {
            return unavailableStatus(exception.code(), context);
        }
    }

    public CoreUpdateModels.Status check() {
        CoreUpdateModels.Status current = status();
        if (!current.helperAvailable()
                || !"ready".equals(current.status())
                        && !"completed".equals(current.status())
                        && !"failed".equals(current.status())
                        && !"rolled_back".equals(current.status())) {
            return current;
        }
        Optional<ManagedRelease> available = releases.findUpdate();
        if (available.isEmpty()) {
            return new CoreUpdateModels.Status(
                    current.schemaVersion(),
                    "current",
                    true,
                    false,
                    "Autark-OS is up to date.",
                    current.installedVersion(),
                    current.channel(),
                    null,
                    current.candidate(),
                    current.jobId(),
                    Instant.now());
        }
        ManagedRelease release = available.get();
        return new CoreUpdateModels.Status(
                current.schemaVersion(),
                "update_available",
                true,
                false,
                "Autark-OS " + release.version() + " is ready to install.",
                current.installedVersion(),
                current.channel(),
                release.summary(),
                null,
                current.jobId(),
                Instant.now());
    }

    @EventListener(ApplicationReadyEvent.class)
    public void reconcileAfterCoreRestart() {
        CoreUpdateModels.Status current = status();
        if (blank(current.jobId())) {
            return;
        }
        if ("completed".equals(current.status())) {
            jobs.reconcileExternalOutcome(
                    current.jobId(), JOB_TYPE,
                    AutarkOsJobOutcome.succeeded(
                            "Autark-OS installed the signed release and passed health verification.",
                            completedSteps()));
        } else if ("failed".equals(current.status())
                || "rolled_back".equals(current.status())) {
            jobs.reconcileExternalOutcome(
                    current.jobId(), JOB_TYPE,
                    AutarkOsJobOutcome.failed(
                            "The core update did not complete; Autark-OS kept or restored a recoverable release.",
                            failedSteps("health", current.message())));
        }
    }

    public AutarkOsJob apply(CoreUpdateModels.ApplyRequest request) {
        if (request == null || blank(request.version())) {
            throw badRequest("release_required", "Check for an Autark-OS update before installing.");
        }
        ManagedRelease release = releases.findUpdate()
                .orElseThrow(() -> badRequest("no_update", "Autark-OS is already up to date."));
        if (!release.version().equals(request.version())) {
            throw new CoreUpdateException(
                    "release_changed",
                    "A newer release became available. Review the update again before installing.",
                    HttpStatus.CONFLICT);
        }
        return jobs.startWithJob(JOB_TYPE, JOB_SUBJECT, updateSteps(),
                job -> runUpdate(job, release));
    }

    private AutarkOsJobOutcome runUpdate(
            AutarkOsJob job,
            ManagedRelease release) {
        String bundleId = UUID.randomUUID().toString().replace("-", "");
        Path inbox = runtimeLayout.runtimeRoot().resolve("core-update-inbox").normalize();
        Path archive = inbox.resolve(bundleId + ".tar.gz").normalize();
        String activeStep = "download";
        try {
            if (!archive.startsWith(inbox)) {
                throw new CoreUpdateException(
                        "unsafe_download",
                        "The published update could not be staged safely.",
                        HttpStatus.SERVICE_UNAVAILABLE);
            }
            jobs.recordProgress(job.jobId(), progressSteps("download", "Downloading Autark-OS " + release.version() + "."));
            releases.download(release, archive);
            activeStep = "verify";
            jobs.recordProgress(job.jobId(), progressSteps("verify", "Verifying the signed Autark-OS release."));
            CoreUpdateModels.Status staged = invoke(
                    "stage", List.of("--bundle-id", bundleId), HELPER_TIMEOUT);
            requireBundle(staged, bundleId);
            CoreUpdateModels.Status verified = invoke(
                    "verify", List.of("--bundle-id", bundleId), HELPER_TIMEOUT);
            CoreUpdateModels.Candidate candidate = requireCandidate(verified);
            if (!release.version().equals(candidate.version())) {
                throw new CoreUpdateException(
                        "release_changed",
                        "The downloaded release did not match the approved Autark-OS version.",
                        HttpStatus.CONFLICT);
            }
            activeStep = "approve";
            jobs.recordProgress(job.jobId(), progressSteps("approve", "Preparing the verified update."));
            String approval = approve(List.of(
                    "--bundle-id", bundleId,
                    "--identity", candidate.identity(),
                    "--job-id", job.jobId()));
            if (blank(approval)) {
                return AutarkOsJobOutcome.failed("The protected update approval could not be recorded.", failedSteps("approve", "The one-time approval could not be recorded."));
            }
            activeStep = "apply";
            jobs.recordProgress(job.jobId(), progressSteps("apply", "Starting the protected update worker."));
            invoke("apply", List.of(
                    "--bundle-id", bundleId,
                    "--approval-id", approval), UPDATE_START_TIMEOUT);
            jobs.recordProgress(job.jobId(), progressSteps("health", "The protected update worker is installing and checking the release."));
            return waitForTerminalState(release.version(), job.jobId());
        } catch (CoreUpdateException exception) {
            return AutarkOsJobOutcome.failed(exception.getMessage(), failedSteps(activeStep, exception.getMessage()));
        } finally {
            deleteQuietly(archive);
        }
    }

    private AutarkOsJobOutcome waitForTerminalState(
            String version,
            String jobId) {
        for (int attempt = 0; attempt < 300; attempt++) {
            CoreUpdateModels.Status current = status();
            if ("completed".equals(current.status())) {
                return AutarkOsJobOutcome.succeeded("Autark-OS installed " + version + " and passed its health check.", completedSteps());
            }
            if ("failed".equals(current.status()) || "rolled_back".equals(current.status())) {
                return AutarkOsJobOutcome.failed("The update did not complete; Autark-OS kept or restored the recoverable release.", failedSteps("health", current.message()));
            }
            jobs.recordProgress(jobId, progressSteps("health", "The protected update worker is installing and checking the release."));
            try {
                Thread.sleep(1_000);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return AutarkOsJobOutcome.failed("The update monitoring task was interrupted. Check the durable core-update status after reconnecting.", failedSteps("health", "Monitoring was interrupted."));
            }
        }
        return AutarkOsJobOutcome.failed("The protected update worker did not report completion in time. Check the durable core-update status after reconnecting.", failedSteps("health", "The worker did not report completion in time."));
    }

    private CoreUpdateModels.Status invoke(
            String operation,
            List<String> arguments,
            Duration timeout) {
        HelperResult result = helper.run(operation, arguments, timeout);
        JsonNode payload;
        try {
            payload = objectMapper.readTree(result.output());
        } catch (Exception exception) {
            throw helperUnavailable(result);
        }
        if (payload == null || !payload.isObject()) {
            throw helperUnavailable(result);
        }
        String status = payload.path("status").asText("");
        if (!result.successful() || "error".equals(status)) {
            String code = payload.path("code").asText("helper_failed");
            throw helperError(code);
        }
        CoreUpdateModels.Candidate candidate = candidate(payload.path("candidate"));
        return new CoreUpdateModels.Status(
                "1",
                safeStatus(status),
                true,
                false,
                safeMessage(status),
                "",
                "",
                null,
                candidate,
                nullableText(payload, "jobId"),
                instant(payload.path("updatedAt").asText(null)));
    }

    private String approve(List<String> arguments) {
        HelperResult result = helper.run("approve", arguments, HELPER_TIMEOUT);
        JsonNode payload;
        try {
            payload = objectMapper.readTree(result.output());
        } catch (Exception exception) {
            throw helperUnavailable(result);
        }
        if (payload == null || !payload.isObject()
                || !result.successful()
                || "error".equals(payload.path("status").asText())) {
            throw helperError(payload == null ? "helper_failed"
                    : payload.path("code").asText("helper_failed"));
        }
        String approval = nullableText(payload, "approvalId");
        if (blank(approval)) {
            throw new CoreUpdateException("approval_missing", "The protected update approval could not be recorded.", HttpStatus.SERVICE_UNAVAILABLE);
        }
        return approval;
    }

    private CoreUpdateModels.Status unavailableStatus(
            String code,
            ReleaseContext context) {
        return new CoreUpdateModels.Status(
                "1",
                "repair_required",
                false,
                !"signing_key_missing".equals(code),
                helperMessage(code),
                context.installedVersion(),
                context.channel(),
                null,
                null,
                null,
                Instant.now());
    }

    private CoreUpdateModels.Status contextualize(
            CoreUpdateModels.Status status,
            ReleaseContext context,
            CoreUpdateModels.AvailableRelease availableRelease) {
        return new CoreUpdateModels.Status(
                status.schemaVersion(),
                status.status(),
                status.helperAvailable(),
                status.repairAvailable(),
                status.message(),
                context.installedVersion(),
                context.channel(),
                availableRelease,
                status.candidate(),
                status.jobId(),
                status.updatedAt());
    }

    private CoreUpdateModels.Candidate requireCandidate(CoreUpdateModels.Status status) {
        if (status.candidate() == null) {
            throw badRequest("candidate_required", "The verified Autark-OS update is no longer available. Check again.");
        }
        return status.candidate();
    }

    private static void requireBundle(
            CoreUpdateModels.Status status,
            String bundleId) {
        if (status.candidate() == null
                || !bundleId.equals(status.candidate().bundleId())) {
            throw new CoreUpdateException("helper_protocol_invalid", "The protected update helper returned an invalid release reference.", HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private CoreUpdateModels.Candidate candidate(JsonNode value) {
        if (value == null || !value.isObject()) {
            return null;
        }
        String bundleId = nullableText(value, "bundleId");
        String identity = nullableText(value, "identity");
        String version = nullableText(value, "version");
        String architecture = nullableText(value, "architecture");
        if (blank(bundleId) || blank(identity) || blank(version) || blank(architecture)) {
            return null;
        }
        return new CoreUpdateModels.Candidate(bundleId, identity, version, architecture);
    }

    private static String nullableText(JsonNode value, String field) {
        String text = value.path(field).asText("").trim();
        return text.isEmpty() ? null : text;
    }

    private static Instant instant(String value) {
        if (blank(value)) return Instant.now();
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException exception) {
            return Instant.now();
        }
    }

    private static String safeStatus(String value) {
        return switch (value) {
            case "ready", "staged", "verified", "approved", "applying", "rolling_back", "completed", "rolled_back", "failed" -> value;
            default -> "repair_required";
        };
    }

    private static String safeMessage(String status) {
        return switch (safeStatus(status)) {
            case "ready" -> "No core update is in progress.";
            case "staged" -> "Autark-OS downloaded the update and is verifying it.";
            case "verified" -> "The Autark-OS update passed verification.";
            case "approved" -> "The verified Autark-OS update is ready to install.";
            case "applying" -> "Autark-OS is installing the signed release and will reconnect after health verification.";
            case "rolling_back" -> "Autark-OS is restoring the protected update snapshot and checking health.";
            case "completed" -> "The signed core update completed and passed its health check.";
            case "rolled_back", "failed" -> "The update did not complete; Autark-OS kept or restored a recoverable release.";
            default -> "The protected core-update helper needs repair before an update can run.";
        };
    }

    private static String helperMessage(String code) {
        return switch (code) {
            case "helper_missing", "policy_missing", "root_required", "verifier_missing" -> "Autark-OS needs to repair its update service before continuing.";
            case "signing_key_missing" -> "Updates are unavailable because this installation cannot verify published Autark-OS releases.";
            case "unsigned_bundle", "signature_missing", "signature_invalid" -> "This release cannot be installed because its trusted signature could not be verified.";
            case "architecture_mismatch" -> "This release was built for a different processor architecture.";
            default -> "Autark-OS could not prepare its update service. Repair the installation and try again.";
        };
    }

    private static CoreUpdateException helperError(String code) {
        HttpStatus status = switch (code) {
            case "candidate_changed", "update_busy" -> HttpStatus.CONFLICT;
            case "helper_missing", "policy_missing", "root_required", "verifier_missing", "signing_key_missing" -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.BAD_REQUEST;
        };
        return new CoreUpdateException(code, helperMessage(code), status);
    }

    private static CoreUpdateException helperUnavailable(HelperResult result) {
        String code = result.missing() ? "helper_missing" : "helper_unavailable";
        return new CoreUpdateException(code, helperMessage(code), HttpStatus.SERVICE_UNAVAILABLE);
    }

    private static CoreUpdateException badRequest(String code, String message) {
        return new CoreUpdateException(code, message, HttpStatus.BAD_REQUEST);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // The root helper rejects any unsafe or stale inbox entry.
        }
    }

    private static List<AutarkOsJobStep> updateSteps() {
        return List.of(
                AutarkOsJobStep.pending("download", "Download update"),
                AutarkOsJobStep.pending("verify", "Verify update"),
                AutarkOsJobStep.pending("approve", "Prepare update"),
                AutarkOsJobStep.pending("apply", "Install update"),
                AutarkOsJobStep.pending("health", "Confirm successful start"));
    }

    private static List<AutarkOsJobStep> progressSteps(String active, String message) {
        List<AutarkOsJobStep> steps = new ArrayList<>();
        boolean reachedActive = false;
        for (AutarkOsJobStep step : updateSteps()) {
            if (step.id().equals(active)) {
                steps.add(AutarkOsJobStep.running(step.id(), step.label(), message));
                reachedActive = true;
            } else if (!reachedActive) {
                steps.add(AutarkOsJobStep.succeeded(step.id(), step.label(), "Completed."));
            } else {
                steps.add(step);
            }
        }
        return steps;
    }

    private static List<AutarkOsJobStep> completedSteps() {
        return updateSteps().stream().map(step ->
                AutarkOsJobStep.succeeded(step.id(), step.label(), "Completed.")).toList();
    }

    private static List<AutarkOsJobStep> failedSteps(String active, String message) {
        return updateSteps().stream().map(step -> step.id().equals(active)
                ? AutarkOsJobStep.failed(step.id(), step.label(), message)
                : step).toList();
    }

    interface HelperRunner {
        HelperResult run(String operation, List<String> arguments, Duration timeout);
    }

    interface ReleaseSource {
        ReleaseContext context();

        Optional<ManagedRelease> findUpdate();

        void download(ManagedRelease release, Path destination);
    }

    record ReleaseContext(
            String installedVersion,
            String channel,
            String architecture) {
    }

    record ManagedRelease(
            String version,
            String channel,
            String releaseNotesUrl,
            String architecture,
            URI artifactUri,
            String sha256,
            long sizeBytes) {

        CoreUpdateModels.AvailableRelease summary() {
            return new CoreUpdateModels.AvailableRelease(
                    version,
                    channel,
                    releaseNotesUrl);
        }
    }

    record HelperResult(boolean successful, boolean missing, String output) {
    }

    private static class ProcessHelperRunner implements HelperRunner {
        private final SystemCommandRunner runner;
        private final String helperPath;

        private ProcessHelperRunner(SystemCommandRunner runner, String helperPath) {
            this.runner = runner;
            this.helperPath = helperPath;
        }

        @Override
        public HelperResult run(String operation, List<String> arguments, Duration timeout) {
            List<String> command = new ArrayList<>(List.of("sudo", "-n", helperPath, operation));
            command.addAll(arguments);
            SystemCommandRunner.CommandExecutionResult result = runner.run(
                    command, timeout,
                    "The protected update helper did not respond in time.",
                    "The protected update helper was interrupted.");
            return new HelperResult(result.successful(), result.missingCommand(), result.output());
        }
    }
}
