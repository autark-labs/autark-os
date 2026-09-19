package com.autarkos.apps.recovery;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;

@RestController
@RequestMapping("/api/app-recovery")
public class AppRecoveryController {

    private final AppRecoveryService service;
    private final AutarkOsJobService jobs;
    private final ApplicationStateService applicationState;

    public AppRecoveryController(
            AppRecoveryService service,
            AutarkOsJobService jobs,
            ApplicationStateService applicationState) {
        this.service = service;
        this.jobs = jobs;
        this.applicationState = applicationState;
    }

    @GetMapping("/{appId}/plan")
    public AppRecoveryModels.RecoveryPlan plan(@PathVariable String appId) {
        return service.plan(appId);
    }

    @PostMapping("/{appId}/apply")
    public ResponseEntity<?> apply(
            @PathVariable String appId,
            @RequestBody AppRecoveryModels.RecoveryApplyRequest request) {
        AppRecoveryModels.RecoveryPlan plan = service.plan(appId);
        if (!plan.applicable() || !service.reviewedPlanMatches(plan, request)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(plan);
        }
        List<AutarkOsJobStep> steps = recoverySteps();
        AutarkOsJob existing = jobs.existingForRequest(
                AutarkOsStates.JobType.RECOVER_APP, appId, steps, request).orElse(null);
        if (existing != null) {
            return ResponseEntity.ok(existing);
        }
        AutarkOsJob job = jobs.startWithJob(
                AutarkOsStates.JobType.RECOVER_APP,
                appId,
                steps,
                request,
                active -> {
                    try {
                        service.apply(appId, request, phase -> markProgress(active.jobId(), steps, phase));
                        return AutarkOsJobOutcome.succeeded(
                                plan.appName() + " is fully managed by Autark-OS.",
                                steps.stream().map(step -> AutarkOsJobStep.succeeded(
                                        step.id(), step.label(), step.label() + " completed.")).toList());
                    } finally {
                        applicationState.invalidate();
                    }
                });
        applicationState.invalidate();
        return ResponseEntity.accepted().body(job);
    }

    private List<AutarkOsJobStep> recoverySteps() {
        return List.of(
                AutarkOsJobStep.pending("inspect_current_state", "Confirm recovery plan"),
                AutarkOsJobStep.pending("verify_recovery", "Verify current ownership"),
                AutarkOsJobStep.pending("commit_management", "Restore app registration"));
    }

    private void markProgress(String jobId, List<AutarkOsJobStep> steps, String activeStep) {
        int activeIndex = java.util.stream.IntStream.range(0, steps.size())
                .filter(index -> steps.get(index).id().equals(activeStep))
                .findFirst().orElse(-1);
        if (activeIndex < 0) return;
        List<AutarkOsJobStep> progress = new java.util.ArrayList<>();
        for (int index = 0; index < steps.size(); index++) {
            AutarkOsJobStep step = steps.get(index);
            if (index < activeIndex) {
                progress.add(AutarkOsJobStep.succeeded(step.id(), step.label(), step.label() + " completed."));
            } else if (index == activeIndex) {
                progress.add(AutarkOsJobStep.running(step.id(), step.label(), step.label() + " in progress."));
            } else {
                progress.add(step);
            }
        }
        jobs.recordProgress(jobId, progress);
    }
}
