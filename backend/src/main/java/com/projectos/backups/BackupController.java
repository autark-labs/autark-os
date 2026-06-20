package com.projectos.backups;

import com.projectos.backups.api.RestoreRequest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/backups")
public class BackupController {

    private final BackupService backupService;

    public BackupController(BackupService backupService) {
        this.backupService = backupService;
    }

    @GetMapping
    public BackupReport report() {
        return backupService.report();
    }

    @PostMapping("/apps/{appId}/run")
    public BackupRunResult run(@PathVariable String appId) {
        return backupService.run(appId);
    }

    @PostMapping("/full/run")
    public BackupRunResult runFull() {
        return backupService.runFullBackup("manual");
    }

    @PostMapping("/routine/run")
    public BackupRunResult runRoutine() {
        return backupService.runAutomatic();
    }

    @GetMapping("/restore-points/{id}/plan")
    public RestorePlan restorePlan(@PathVariable long id, @RequestParam(required = false) String appId) {
        return backupService.restorePlan(id, appId);
    }

    @PostMapping("/restore-points/{id}/verify")
    public BackupVerificationResult verify(@PathVariable long id) {
        return backupService.verify(id);
    }

    @PostMapping("/restore-points/{id}/restore")
    public RestoreResult restore(@PathVariable long id, @RequestBody(required = false) RestoreRequest request) {
        return backupService.restore(id, request == null ? null : request.appId());
    }
}
