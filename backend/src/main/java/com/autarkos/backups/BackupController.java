package com.autarkos.backups;

import com.autarkos.backups.api.RestoreRequest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.apps.ApplicationStateService;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;

@RestController
@RequestMapping("/api/backups")
public class BackupController {

    private final BackupService backupService;
    private final AutarkOsJobService jobService;
    private final ApplicationStateService applicationStateService;

    public BackupController(BackupService backupService, AutarkOsJobService jobService, ApplicationStateService applicationStateService) {
        this.backupService = backupService;
        this.jobService = jobService;
        this.applicationStateService = applicationStateService;
    }

    @GetMapping
    public BackupReport report() {
        return backupService.report();
    }

    @PostMapping("/apps/{appId}/run")
    public AutarkOsJob run(@PathVariable String appId) {
        AutarkOsJob job = jobService.start("backup", appId, backupSteps(), () -> {
            BackupRunResult result = backupService.run(appId);
            invalidateApplicationState();
            return backupOutcome(result);
        });
        invalidateApplicationState();
        return job;
    }

    @PostMapping("/full/run")
    public AutarkOsJob runFull() {
        return jobService.start("backup", "__full__", backupSteps(), () -> backupOutcome(backupService.runFullBackup("manual")));
    }

    @PostMapping("/routine/run")
    public AutarkOsJob runRoutine() {
        return jobService.start("backup", "__routine__", backupSteps(), () -> backupOutcome(backupService.runAutomatic()));
    }

    @GetMapping("/restore-points/{id}/plan")
    public RestorePlan restorePlan(@PathVariable long id, @RequestParam(required = false) String appId) {
        return backupService.restorePlan(id, appId);
    }

    @PostMapping("/restore-points/{id}/verify")
    public AutarkOsJob verify(@PathVariable long id) {
        return jobService.start("backup_verify", Long.toString(id), verificationSteps(), () -> verificationOutcome(backupService.verify(id)));
    }

    @PostMapping("/restore-points/{id}/restore")
    public AutarkOsJob restore(@PathVariable long id, @RequestBody(required = false) RestoreRequest request) {
        String appId = request == null ? null : request.appId();
        AutarkOsJob job = jobService.start("backup_restore", restoreSubject(id, appId), restoreSteps(), () -> {
            RestoreResult result = backupService.restore(id, appId);
            invalidateApplicationState();
            return restoreOutcome(result);
        });
        invalidateApplicationState();
        return job;
    }

    private java.util.List<AutarkOsJobStep> backupSteps() {
        return java.util.List.of(
                AutarkOsJobStep.pending("prepare_backup", "Preparing restore point"),
                AutarkOsJobStep.pending("copy_data", "Copying app data"),
                AutarkOsJobStep.pending("verify_backup", "Verifying restore point"),
                AutarkOsJobStep.pending("finish", "Finishing backup"));
    }

    private AutarkOsJobOutcome backupOutcome(BackupRunResult result) {
        if ("failed".equals(result.status())) {
            java.util.List<AutarkOsJobStep> steps = java.util.List.of(
                    AutarkOsJobStep.succeeded("prepare_backup", "Preparing restore point", "Backup destination checked."),
                    AutarkOsJobStep.failed("copy_data", "Copying app data", result.message()),
                    AutarkOsJobStep.pending("verify_backup", "Verifying restore point"),
                    AutarkOsJobStep.pending("finish", "Finishing backup"));
            return AutarkOsJobOutcome.failed(result.message(), steps);
        }
        java.util.List<AutarkOsJobStep> steps = java.util.List.of(
                AutarkOsJobStep.succeeded("prepare_backup", "Preparing restore point", "Backup destination checked."),
                AutarkOsJobStep.succeeded("copy_data", "Copying app data", result.message()),
                AutarkOsJobStep.succeeded("verify_backup", "Verifying restore point", result.restorePoint() == null ? "" : result.restorePoint().verificationMessage()),
                AutarkOsJobStep.succeeded("finish", "Finishing backup", result.message()));
        return AutarkOsJobOutcome.succeeded(result.message(), steps);
    }

    private java.util.List<AutarkOsJobStep> verificationSteps() {
        return java.util.List.of(
                AutarkOsJobStep.pending("load_restore_point", "Loading restore point"),
                AutarkOsJobStep.pending("verify_archive", "Verifying backup archive"),
                AutarkOsJobStep.pending("record_result", "Recording verification result"),
                AutarkOsJobStep.pending("finish", "Finishing verification"));
    }

    private AutarkOsJobOutcome verificationOutcome(BackupVerificationResult result) {
        java.util.List<AutarkOsJobStep> steps = java.util.List.of(
                AutarkOsJobStep.succeeded("load_restore_point", "Loading restore point", "Restore point loaded."),
                "failed".equals(result.status())
                        ? AutarkOsJobStep.failed("verify_archive", "Verifying backup archive", result.message())
                        : AutarkOsJobStep.succeeded("verify_archive", "Verifying backup archive", result.message()),
                AutarkOsJobStep.succeeded("record_result", "Recording verification result", "Verification status saved."),
                AutarkOsJobStep.succeeded("finish", "Finishing verification", result.message()));
        if ("failed".equals(result.status())) {
            return AutarkOsJobOutcome.failed(result.message(), steps);
        }
        return AutarkOsJobOutcome.succeeded(result.message(), steps);
    }

    private java.util.List<AutarkOsJobStep> restoreSteps() {
        return java.util.List.of(
                AutarkOsJobStep.pending("validate_restore_point", "Validating restore point"),
                AutarkOsJobStep.pending("stop_apps", "Stopping affected apps"),
                AutarkOsJobStep.pending("create_safety_backup", "Creating safety backup"),
                AutarkOsJobStep.pending("restore_data", "Restoring app data"),
                AutarkOsJobStep.pending("start_apps", "Starting affected apps"),
                AutarkOsJobStep.pending("finish", "Finishing restore"));
    }

    private AutarkOsJobOutcome restoreOutcome(RestoreResult result) {
        boolean failed = "failed".equals(result.status());
        boolean warning = "warning".equals(result.status());
        java.util.List<AutarkOsJobStep> steps = java.util.List.of(
                AutarkOsJobStep.succeeded("validate_restore_point", "Validating restore point", "Restore point is ready."),
                AutarkOsJobStep.succeeded("stop_apps", "Stopping affected apps", "Affected apps were prepared for restore."),
                AutarkOsJobStep.succeeded("create_safety_backup", "Creating safety backup", "Current app data was protected before restore."),
                failed
                        ? AutarkOsJobStep.failed("restore_data", "Restoring app data", result.message())
                        : AutarkOsJobStep.succeeded("restore_data", "Restoring app data", result.message()),
                failed
                        ? AutarkOsJobStep.pending("start_apps", "Starting affected apps")
                        : warning
                                ? AutarkOsJobStep.failed("start_apps", "Starting affected apps", result.message())
                                : AutarkOsJobStep.succeeded("start_apps", "Starting affected apps", "Affected apps were started after restore."),
                failed || warning
                        ? AutarkOsJobStep.pending("finish", "Finishing restore")
                        : AutarkOsJobStep.succeeded("finish", "Finishing restore", result.message()));
        if (failed || warning) {
            return AutarkOsJobOutcome.failed(result.message(), steps);
        }
        return AutarkOsJobOutcome.succeeded(result.message(), steps);
    }

    private String restoreSubject(long id, String appId) {
        return id + ":" + (appId == null || appId.isBlank() ? "all" : appId);
    }

    private void invalidateApplicationState() {
        if (applicationStateService != null) {
            applicationStateService.invalidate();
        }
    }
}
