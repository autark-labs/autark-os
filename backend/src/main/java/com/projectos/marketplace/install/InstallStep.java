package com.projectos.marketplace.install;

import java.time.Instant;

public record InstallStep(String label, String status, String detail, Instant timestamp) {
    public static InstallStep completed(String label, String detail) {
        return new InstallStep(label, "completed", detail, Instant.now());
    }

    public static InstallStep failed(String label, String detail) {
        return new InstallStep(label, "failed", detail, Instant.now());
    }
}
