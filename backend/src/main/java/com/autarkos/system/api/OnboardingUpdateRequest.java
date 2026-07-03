package com.autarkos.system.api;

import java.util.List;

public record OnboardingUpdateRequest(
        String status,
        Integer currentStep,
        String deviceName,
        String backupDestination,
        Boolean automaticBackupsEnabled,
        String privateAccessChoice,
        List<String> recommendedApps,
        List<String> completedSteps) {
}
