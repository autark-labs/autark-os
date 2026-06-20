package com.projectos.system.api;

import java.time.Instant;
import java.util.List;

public record OnboardingState(
        String status,
        int currentStep,
        String deviceName,
        String runtimePath,
        String backupDestination,
        boolean tailscaleConnected,
        String privateAccessChoice,
        boolean automaticBackupsEnabled,
        List<String> recommendedApps,
        List<String> completedSteps,
        SystemDoctorStatus doctor,
        Instant updatedAt) {
}
