package com.autarkos.api;

public record AppOperationView(
        String kind,
        String label,
        String jobId,
        String currentStep,
        String message) {

    public static AppOperationView idle() {
        return new AppOperationView(AutarkOsStates.OperationKind.IDLE, "", null, "", "");
    }

    public static AppOperationView running(String kind, String label, String jobId, String currentStep, String message) {
        return new AppOperationView(kind, label, jobId, currentStep == null ? "" : currentStep, message == null ? "" : message);
    }

    public static AppOperationView failed(String label, String jobId, String message) {
        return new AppOperationView(AutarkOsStates.OperationKind.FAILED, label, jobId, "", message == null ? "Autark-OS could not finish this action." : message);
    }
}
