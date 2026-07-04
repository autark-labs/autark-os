package com.autarkos.marketplace.install;

import java.time.Instant;

import com.autarkos.api.AutarkOsStates;

public record InstallStep(String label, String status, String detail, Instant timestamp) {
    public static InstallStep completed(String label, String detail) {
        return new InstallStep(label, AutarkOsStates.JobStatus.COMPLETED, detail, Instant.now());
    }

    public static InstallStep failed(String label, String detail) {
        return new InstallStep(label, AutarkOsStates.JobStatus.FAILED, detail, Instant.now());
    }

    public static InstallStep warning(String label, String detail) {
        return new InstallStep(label, AutarkOsStates.Tone.WARNING, detail, Instant.now());
    }
}
