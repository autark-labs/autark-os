package com.projectos.backups;

import com.projectos.backups.api.RestoreRequest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.projectos.apps.ApplicationStateService;
import com.projectos.jobs.ProjectOsJob;
import com.projectos.jobs.ProjectOsJobOutcome;
import com.projectos.jobs.ProjectOsJobService;
import com.projectos.jobs.ProjectOsJobStep;

@RestController
@RequestMapping("/api/backups")
public class BackupController {

    private final BackupService backupService;
    private final ProjectOsJobService jobService;
    private final ApplicationStateService applicationStateService;

    public BackupController(BackupService backupService, ProjectOsJobService jobService, ApplicationStateService applicationStateService) {
        this.backupService = backupService;
        this.jobService = jobService;
        this.applicationStateService = applicationStateService;
    }

    @GetMapping
    public BackupReport report() {
        return backupService.report();
    }

    @PostMapping("/apps/{appId}/run")
    public ProjectOsJob run(@PathVariable String appId) {
        ProjectOsJob job = jobService.start("backup", appId, backupSteps(), () -> {
            BackupRunResult result = backupService.run(appId);
            invalidateApplicationState();
            return backupOutcome(result);
        });
        invalidateApplicationState();
        return job;
    }

    @PostMapping("/full/run")
    public ProjectOsJob runFull() {
        return jobService.start("backup", "__full__", backupSteps(), () -> backupOutcome(backupService.runFullBackup("manual")));
    }

    @PostMapping("/routine/run")
    public ProjectOsJob runRoutine() {
        return jobService.start("backup", "__routine__", backupSteps(), () -> backupOutcome(backupService.runAutomatic()));
    }

    @GetMapping("/restore-points/{id}/plan")
    public RestorePlan restorePlan(@PathVariable long id, @RequestParam(required = false) String appId) {
        return backupService.restorePlan(id, appId);
    }

    @PostMapping("/restore-points/{id}/verify")
    public ProjectOsJob verify(@PathVariable long id) {
        return jobService.start("backup_verify", Long.toString(id), verificationSteps(), () -> verificationOutcome(backupService.verify(id)));
    }

    @PostMapping("/restore-points/{id}/restore")
    public ProjectOsJob restore(@PathVariable long id, @RequestBody(required = false) RestoreRequest request) {
        String appId = request == null ? null : request.appId();
        ProjectOsJob job = jobService.start("backup_restore", restoreSubject(id, appId), restoreSteps(), () -> {
            RestoreResult result = backupService.restore(id, appId);
            invalidateApplicationState();
            return restoreOutcome(result);
        });
        invalidateApplicationState();
        return job;
    }

    private java.util.List<ProjectOsJobStep> backupSteps() {
        return java.util.List.of(
                ProjectOsJobStep.pending("prepare_backup", "Preparing restore point"),
                ProjectOsJobStep.pending("copy_data", "Copying app data"),
                ProjectOsJobStep.pending("verify_backup", "Verifying restore point"),
                ProjectOsJobStep.pending("finish", "Finishing backup"));
    }

    private ProjectOsJobOutcome backupOutcome(BackupRunResult result) {
        if ("failed".equals(result.status())) {
            java.util.List<ProjectOsJobStep> steps = java.util.List.of(
                    ProjectOsJobStep.succeeded("prepare_backup", "Preparing restore point", "Backup destination checked."),
                    ProjectOsJobStep.failed("copy_data", "Copying app data", result.message()),
                    ProjectOsJobStep.pending("verify_backup", "Verifying restore point"),
                    ProjectOsJobStep.pending("finish", "Finishing backup"));
            return ProjectOsJobOutcome.failed(result.message(), steps);
        }
        java.util.List<ProjectOsJobStep> steps = java.util.List.of(
                ProjectOsJobStep.succeeded("prepare_backup", "Preparing restore point", "Backup destination checked."),
                ProjectOsJobStep.succeeded("copy_data", "Copying app data", result.message()),
                ProjectOsJobStep.succeeded("verify_backup", "Verifying restore point", result.restorePoint() == null ? "" : result.restorePoint().verificationMessage()),
                ProjectOsJobStep.succeeded("finish", "Finishing backup", result.message()));
        return ProjectOsJobOutcome.succeeded(result.message(), steps);
    }

    private java.util.List<ProjectOsJobStep> verificationSteps() {
        return java.util.List.of(
                ProjectOsJobStep.pending("load_restore_point", "Loading restore point"),
                ProjectOsJobStep.pending("verify_archive", "Verifying backup archive"),
                ProjectOsJobStep.pending("record_result", "Recording verification result"),
                ProjectOsJobStep.pending("finish", "Finishing verification"));
    }

    private ProjectOsJobOutcome verificationOutcome(BackupVerificationResult result) {
        java.util.List<ProjectOsJobStep> steps = java.util.List.of(
                ProjectOsJobStep.succeeded("load_restore_point", "Loading restore point", "Restore point loaded."),
                "failed".equals(result.status())
                        ? ProjectOsJobStep.failed("verify_archive", "Verifying backup archive", result.message())
                        : ProjectOsJobStep.succeeded("verify_archive", "Verifying backup archive", result.message()),
                ProjectOsJobStep.succeeded("record_result", "Recording verification result", "Verification status saved."),
                ProjectOsJobStep.succeeded("finish", "Finishing verification", result.message()));
        if ("failed".equals(result.status())) {
            return ProjectOsJobOutcome.failed(result.message(), steps);
        }
        return ProjectOsJobOutcome.succeeded(result.message(), steps);
    }

    private java.util.List<ProjectOsJobStep> restoreSteps() {
        return java.util.List.of(
                ProjectOsJobStep.pending("validate_restore_point", "Validating restore point"),
                ProjectOsJobStep.pending("stop_apps", "Stopping affected apps"),
                ProjectOsJobStep.pending("create_safety_backup", "Creating safety backup"),
                ProjectOsJobStep.pending("restore_data", "Restoring app data"),
                ProjectOsJobStep.pending("start_apps", "Starting affected apps"),
                ProjectOsJobStep.pending("finish", "Finishing restore"));
    }

    private ProjectOsJobOutcome restoreOutcome(RestoreResult result) {
        java.util.List<ProjectOsJobStep> steps = java.util.List.of(
                ProjectOsJobStep.succeeded("validate_restore_point", "Validating restore point", "Restore point is ready."),
                ProjectOsJobStep.succeeded("stop_apps", "Stopping affected apps", "Affected apps were prepared for restore."),
                ProjectOsJobStep.succeeded("create_safety_backup", "Creating safety backup", "Current app data was protected before restore."),
                "failed".equals(result.status())
                        ? ProjectOsJobStep.failed("restore_data", "Restoring app data", result.message())
                        : ProjectOsJobStep.succeeded("restore_data", "Restoring app data", result.message()),
                "failed".equals(result.status())
                        ? ProjectOsJobStep.pending("start_apps", "Starting affected apps")
                        : ProjectOsJobStep.succeeded("start_apps", "Starting affected apps", "Affected apps were started after restore."),
                "failed".equals(result.status())
                        ? ProjectOsJobStep.pending("finish", "Finishing restore")
                        : ProjectOsJobStep.succeeded("finish", "Finishing restore", result.message()));
        if ("failed".equals(result.status())) {
            return ProjectOsJobOutcome.failed(result.message(), steps);
        }
        return ProjectOsJobOutcome.succeeded(result.message(), steps);
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
