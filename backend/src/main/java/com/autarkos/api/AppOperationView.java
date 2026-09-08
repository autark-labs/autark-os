package com.autarkos.api;

public record AppOperationView(
        String kind,
        String label,
        String jobId,
        String currentStep,
        String message,
        String jobType) {

    public AppOperationView(String kind, String label, String jobId, String currentStep, String message) {
        this(kind, label, jobId, currentStep, message, null);
    }

    public static AppOperationView idle() {
        return new AppOperationView(AutarkOsStates.OperationKind.IDLE, "", null, "", "");
    }

    public static AppOperationView running(String kind, String label, String jobId, String currentStep, String message) {
        return new AppOperationView(kind, label, jobId, currentStep == null ? "" : currentStep, message == null ? "" : message);
    }

    public static AppOperationView failed(String label, String jobId, String message, String jobType) {
        return new AppOperationView(AutarkOsStates.OperationKind.FAILED, label, jobId, "",
                message == null || message.isBlank() ? "Autark-OS could not finish this action." : message, jobType);
    }
}
