package com.autarkos.jobs;

/** The requested action was not accepted; the owner can follow the existing job. */
public class JobConflictException extends RuntimeException {
    private final AutarkOsJob activeJob;

    JobConflictException(AutarkOsJob activeJob) {
        super("Another operation is already " + activeJob.status() + ": "
                + activeJob.steps().stream().filter(step -> step.id().equals(activeJob.currentStep()))
                        .map(AutarkOsJobStep::label).findFirst().orElse("an app operation")
                + ". This request was not started. Wait for that operation to finish, then try again.");
        this.activeJob = activeJob;
    }

    public AutarkOsJob activeJob() { return activeJob; }
}
