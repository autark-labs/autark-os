package com.projectos.system.api;

import java.time.Instant;
import java.util.List;

public record SystemDoctorStatus(
        String status,
        String headline,
        String summary,
        SystemReadinessStatus readiness,
        List<SystemSetupCheck> checks,
        List<SystemSetupCheck> repairableChecks,
        String detectedOs,
        String packageManager,
        boolean automatedDependencyInstallSupported,
        String lanUrl,
        Instant checkedAt) {
}
