package com.autarkos.backups;

import java.util.List;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobStep;

/** Shared job presentation for manual and scheduled backups. */
final class BackupJobs {

    private BackupJobs() {
    }

    static List<AutarkOsJobStep> steps() {
        return List.of(
                AutarkOsJobStep.pending("prepare_backup", "Preparing restore point"),
                AutarkOsJobStep.pending("copy_data", "Copying app data"),
                AutarkOsJobStep.pending("verify_backup", "Verifying restore point"),
                AutarkOsJobStep.pending("finish", "Finishing backup"));
    }

    static AutarkOsJobOutcome outcome(BackupModels.BackupRunResult result) {
        if (AutarkOsStates.JobStatus.FAILED.equals(result.status())) {
            List<AutarkOsJobStep> steps = List.of(
                    AutarkOsJobStep.succeeded("prepare_backup", "Preparing restore point", "Backup destination checked."),
                    AutarkOsJobStep.failed("copy_data", "Copying app data", result.message()),
                    AutarkOsJobStep.pending("verify_backup", "Verifying restore point"),
                    AutarkOsJobStep.pending("finish", "Finishing backup"));
            return AutarkOsJobOutcome.failed(result.message(), steps);
        }
        if (AutarkOsStates.Tone.WARNING.equals(result.status())) {
            List<AutarkOsJobStep> steps = List.of(
                    AutarkOsJobStep.succeeded("prepare_backup", "Preparing restore point", "Backup destination checked."),
                    AutarkOsJobStep.succeeded("copy_data", "Copying app data", "Restore point created."),
                    AutarkOsJobStep.succeeded("verify_backup", "Verifying restore point", result.restorePoint() == null ? "" : result.restorePoint().verificationMessage()),
                    AutarkOsJobStep.failed("finish", "Finishing backup", result.message()));
            return AutarkOsJobOutcome.failed(result.message(), steps);
        }
        List<AutarkOsJobStep> steps = List.of(
                AutarkOsJobStep.succeeded("prepare_backup", "Preparing restore point", "Backup destination checked."),
                AutarkOsJobStep.succeeded("copy_data", "Copying app data", result.message()),
                AutarkOsJobStep.succeeded("verify_backup", "Verifying restore point", result.restorePoint() == null ? "" : result.restorePoint().verificationMessage()),
                AutarkOsJobStep.succeeded("finish", "Finishing backup", result.message()));
        return AutarkOsJobOutcome.succeeded(result.message(), steps);
    }

}
