package com.autarkos.jobs;

public class JobCancellationConflictException extends RuntimeException {

    private final String currentStatus;

    JobCancellationConflictException(String currentStatus) {
        super("This job has already started and cannot be cancelled safely. Wait for it to finish.");
        this.currentStatus = currentStatus;
    }

    public String currentStatus() {
        return currentStatus;
    }
}
