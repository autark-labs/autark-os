package com.autarkos.system;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * CE-side adapter for the root-owned typed update helper. The browser can
 * upload only an opaque archive; it cannot supply a path, URL, command, or
 * approval token to the helper.
 */
@Service
public class CoreUpdateService {

    static final String JOB_TYPE = "core_update";
    static final String JOB_SUBJECT = "autark-os";
    static final long MAX_ARCHIVE_BYTES = 512L * 1024 * 1024;
    static final Duration HELPER_TIMEOUT = Duration.ofSeconds(45);
    static final Duration UPDATE_START_TIMEOUT = Duration.ofSeconds(30);
    static final String CONFIRMATION_PREFIX = "INSTALL-AUTARK-OS-";

    private final RuntimeLayout runtimeLayout;
    private final AutarkOsJobService jobs;
    private final HelperRunner helper;
    private final ObjectMapper objectMapper;

    @Autowired
    public CoreUpdateService(
            RuntimeLayout runtimeLayout,
            AutarkOsJobService jobs,
            SystemCommandRunner commandRunner,
            @Value("${autark-os.core-update.helper:/opt/autark-os/bin/autark-os-update-helper}")
                    String helperPath) {
        this(runtimeLayout, jobs, new ProcessHelperRunner(commandRunner, helperPath),
                new ObjectMapper());
    }

    CoreUpdateService(
            RuntimeLayout runtimeLayout,
            AutarkOsJobService jobs,
            HelperRunner helper,
            ObjectMapper objectMapper) {
        this.runtimeLayout = runtimeLayout;
        this.jobs = jobs;
        this.helper = helper;
        this.objectMapper = objectMapper;
    }

    public CoreUpdateModels.Status status() {
        try {
            CoreUpdateModels.Status current = invoke("status", List.of(), HELPER_TIMEOUT);
            invoke("health", List.of(), HELPER_TIMEOUT);
            return current;
        } catch (CoreUpdateException exception) {
            return unavailableStatus(exception.code());
        }
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

    public CoreUpdateModels.Status stage(MultipartFile upload) {
        if (upload == null || upload.isEmpty()) {
            throw badRequest("bundle_required", "Choose a signed Autark-OS release bundle to stage.");
        }
        if (upload.getSize() > MAX_ARCHIVE_BYTES) {
            throw badRequest("bundle_too_large", "The release bundle exceeds the supported upload size.");
        }
        String bundleId = UUID.randomUUID().toString().replace("-", "");
        Path inbox = runtimeLayout.runtimeRoot().resolve("core-update-inbox").normalize();
        Path archive = inbox.resolve(bundleId + ".tar.gz").normalize();
        if (!archive.startsWith(inbox)) {
            throw new CoreUpdateException("unsafe_upload", "The release bundle could not be staged safely.", HttpStatus.BAD_REQUEST);
        }
        try {
            Files.createDirectories(inbox);
            copyBounded(upload.getInputStream(), archive);
            CoreUpdateModels.Status staged = invoke(
                    "stage", List.of("--bundle-id", bundleId), HELPER_TIMEOUT);
            requireBundle(staged, bundleId);
            CoreUpdateModels.Status verified = invoke(
                    "verify", List.of("--bundle-id", bundleId), HELPER_TIMEOUT);
            requireBundle(verified, bundleId);
            return verified;
        } catch (IOException exception) {
            deleteQuietly(archive);
            throw new CoreUpdateException("bundle_stage_failed", "The release bundle could not be staged safely.", HttpStatus.BAD_REQUEST);
        } catch (CoreUpdateException exception) {
            deleteQuietly(archive);
            throw exception;
        }
    }

    public AutarkOsJob apply(CoreUpdateModels.ApplyRequest request) {
        if (request == null || blank(request.bundleId()) || blank(request.candidateIdentity())) {
            throw badRequest("candidate_required", "Review a signed release bundle before installing it.");
        }
        CoreUpdateModels.Status current = invoke(
                "inspect", List.of("--bundle-id", request.bundleId()), HELPER_TIMEOUT);
        CoreUpdateModels.Candidate candidate = requireCandidate(current);
        if (!candidate.identity().equals(request.candidateIdentity())) {
            throw new CoreUpdateException("candidate_changed", "The release changed after review. Verify it again before installing.", HttpStatus.CONFLICT);
        }
        if (!expectedConfirmation(candidate.version()).equals(request.confirmation())) {
            throw badRequest("confirmation_required", "Type the exact update confirmation shown for this release.");
        }
        return jobs.startWithJob(JOB_TYPE, JOB_SUBJECT, updateSteps(),
                job -> runUpdate(job, candidate));
    }

    private AutarkOsJobOutcome runUpdate(
            AutarkOsJob job,
            CoreUpdateModels.Candidate candidate) {
        try {
            jobs.recordProgress(job.jobId(), progressSteps("approve", "Recording one-time approval for the exact signed release."));
            String approval = approve(List.of(
                    "--bundle-id", candidate.bundleId(),
                    "--identity", candidate.identity(),
                    "--job-id", job.jobId()));
            if (blank(approval)) {
                return AutarkOsJobOutcome.failed("The protected update approval could not be recorded.", failedSteps("approve", "The one-time approval could not be recorded."));
            }
            jobs.recordProgress(job.jobId(), progressSteps("apply", "Starting the protected update worker."));
            invoke("apply", List.of(
                    "--bundle-id", candidate.bundleId(),
                    "--approval-id", approval), UPDATE_START_TIMEOUT);
            jobs.recordProgress(job.jobId(), progressSteps("health", "The protected update worker is installing and checking the release."));
            return waitForTerminalState(candidate, job.jobId());
        } catch (CoreUpdateException exception) {
            return AutarkOsJobOutcome.failed(exception.getMessage(), failedSteps("apply", exception.getMessage()));
        }
    }

    private AutarkOsJobOutcome waitForTerminalState(
            CoreUpdateModels.Candidate candidate,
            String jobId) {
        for (int attempt = 0; attempt < 300; attempt++) {
            CoreUpdateModels.Status current = status();
            if ("completed".equals(current.status())) {
                return AutarkOsJobOutcome.succeeded("Autark-OS installed " + candidate.version() + " and passed its health check.", completedSteps());
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

    private CoreUpdateModels.Status unavailableStatus(String code) {
        return new CoreUpdateModels.Status(
                "1",
                "repair_required",
                false,
                !"signing_key_missing".equals(code),
                helperMessage(code),
                null,
                null,
                Instant.now());
    }

    private CoreUpdateModels.Candidate requireCandidate(CoreUpdateModels.Status status) {
        if (status.candidate() == null) {
            throw badRequest("candidate_required", "Review and verify a signed release bundle before installing it.");
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
            case "staged" -> "Release bundle staged. Its trusted signature must be verified before installation.";
            case "verified" -> "Release checksums and trusted signature verified. Review and confirm installation.";
            case "approved" -> "One-time approval recorded for the exact signed release.";
            case "applying" -> "Autark-OS is installing the signed release and will reconnect after health verification.";
            case "rolling_back" -> "Autark-OS is restoring the protected update snapshot and checking health.";
            case "completed" -> "The signed core update completed and passed its health check.";
            case "rolled_back", "failed" -> "The update did not complete; Autark-OS kept or restored a recoverable release.";
            default -> "The protected core-update helper needs repair before an update can run.";
        };
    }

    private static String helperMessage(String code) {
        return switch (code) {
            case "helper_missing", "policy_missing", "root_required", "verifier_missing" -> "Autark-OS needs its protected update helper repaired before browser updates can run.";
            case "signing_key_missing" -> "Autark-OS release signing is not configured on this appliance, so browser core updates remain unavailable.";
            case "unsigned_bundle", "signature_missing", "signature_invalid" -> "This release cannot be installed because its trusted signature could not be verified.";
            case "architecture_mismatch" -> "This release was built for a different processor architecture.";
            default -> "The protected core-update helper is unavailable. Repair the supported service installation and try again.";
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

    private static String expectedConfirmation(String version) {
        return CONFIRMATION_PREFIX + version;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private void copyBounded(InputStream input, Path destination) throws IOException {
        long written = 0;
        try (input; var output = Files.newOutputStream(destination,
                StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            byte[] buffer = new byte[8192];
            for (int count; (count = input.read(buffer)) != -1;) {
                written += count;
                if (written > MAX_ARCHIVE_BYTES) {
                    throw new IOException("bundle_too_large");
                }
                output.write(buffer, 0, count);
            }
        }
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
                AutarkOsJobStep.pending("approve", "Record exact release approval"),
                AutarkOsJobStep.pending("apply", "Install signed release"),
                AutarkOsJobStep.pending("health", "Verify health or roll back"));
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
