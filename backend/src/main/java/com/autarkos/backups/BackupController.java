package com.autarkos.backups;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;

@RestController
@RequestMapping("/api/backups")
public class BackupController {

    private final BackupService backupService;
    private final AutarkOsJobService jobService;
    private final ApplicationStateService applicationStateService;
    private final BackupPlanService backupPlans;

    public BackupController(BackupService backupService, AutarkOsJobService jobService, ApplicationStateService applicationStateService, BackupPlanService backupPlans) {
        this.backupService = backupService;
        this.jobService = jobService;
        this.applicationStateService = applicationStateService;
        this.backupPlans = backupPlans;
    }

    @GetMapping
    public BackupModels.BackupReport report() {
        return backupService.report();
    }

    @GetMapping("/plan")
    public BackupModels.BackupPlan plan(@RequestParam String scope, @RequestParam(required = false) String appId) {
        return backupPlans.plan(scope, appId);
    }

    @GetMapping("/destination")
    public BackupModels.BackupDestination destination() {
        return backupService.destination();
    }

    @PostMapping("/destination/preview")
    public BackupModels.BackupDestination previewDestination(@RequestBody BackupModels.BackupDestinationRequest request) {
        return backupService.previewDestination(request == null ? "" : request.path());
    }

    @PostMapping("/destination")
    public BackupModels.BackupDestination configureDestination(@RequestBody BackupModels.BackupDestinationRequest request) {
        BackupModels.BackupDestination destination = backupService.configureDestination(request == null ? "" : request.path());
        invalidateApplicationState();
        return destination;
    }

    @PostMapping("/apps/{appId}/run")
    public AutarkOsJob run(@PathVariable String appId, @RequestBody BackupModels.BackupRunRequest request) {
        return startReviewedBackup("app", appId, appId, request);
    }

    @PostMapping("/full/run")
    public AutarkOsJob runFull(@RequestBody BackupModels.BackupRunRequest request) {
        return startReviewedBackup("full", null, "__full__", request);
    }

    @PostMapping("/routine/run")
    public AutarkOsJob runRoutine(@RequestBody BackupModels.BackupRunRequest request) {
        return startReviewedBackup("routine", null, "__routine__", request);
    }

    private AutarkOsJob startReviewedBackup(String scope, String appId, String subject, BackupModels.BackupRunRequest request) {
        backupPlans.requireReviewed(scope, appId, request);
        AutarkOsJob job = jobService.startWithJob(AutarkOsStates.JobType.BACKUP, subject, BackupJobs.steps(), request, ignored -> {
            try {
                return BackupJobs.outcome(backupPlans.runReviewed(scope, appId, request), jobService);
            } finally {
                invalidateApplicationState();
            }
        });
        invalidateApplicationState();
        return job;
    }

    @GetMapping("/restore-points")
    public BackupModels.RestorePointPage restorePoints(@RequestParam(required = false) Long beforeId, @RequestParam(required = false) String appId) {
        return backupService.restorePoints(beforeId, appId);
    }

    @GetMapping("/restore-points/{id}")
    public RestorePoint restorePoint(@PathVariable long id) {
        return backupService.restorePoint(id);
    }

    @GetMapping("/restore-points/{id}/plan")
    public RestoreModels.RestorePlan restorePlan(@PathVariable long id, @RequestParam(required = false) String appId) {
        return backupService.restorePlan(id, appId);
    }

    @PostMapping("/restore-points/{id}/verify")
    public AutarkOsJob verify(@PathVariable long id) {
        return jobService.start(AutarkOsStates.JobType.BACKUP_VERIFY, Long.toString(id), java.util.List.of(AutarkOsJobStep.pending("load_restore_point", "Loading restore point")), () -> {
            try {
                var result = backupService.verify(id);
                return BackupJobs.outcome(result.status(), result.message(), jobService);
            } finally {
                invalidateApplicationState();
            }
        });
    }

    @PostMapping("/restore-points/{id}/restore")
    public AutarkOsJob restore(@PathVariable long id, @RequestBody RestoreModels.RestoreRequest request) {
        RestorePlanner.requireReviewToken(request == null ? null : request.planId());
        String appId = request.appId();
        AutarkOsJob job = jobService.startReviewedOnce(RestorePlanner.reviewKey(id, appId, request.planId()), AutarkOsStates.JobType.BACKUP_RESTORE, restoreSubject(id, appId), java.util.List.of(AutarkOsJobStep.pending("validate_restore_point", "Validating restore point")), () -> {
            try {
                var result = backupService.restore(id, appId, request.planId());
                return BackupJobs.outcome(result.status(), result.message(), jobService);
            } finally {
                invalidateApplicationState();
            }
        });
        invalidateApplicationState();
        return job;
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
