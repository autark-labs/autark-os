package com.autarkos.system;

import java.time.Instant;
import java.util.List;

import com.autarkos.system.SystemSetupModels.SystemDoctorStatus;

public final class OnboardingModels {

    private OnboardingModels() {
    }

    public record OnboardingState(
            String status,
            int currentStep,
            String deviceName,
            String runtimePath,
            String backupDestination,
            boolean tailscaleConnected,
            String privateAccessChoice,
            boolean automaticBackupsEnabled,
            String backupFrequency,
            List<String> recommendedApps,
            List<String> completedSteps,
            SystemDoctorStatus doctor,
            Instant updatedAt,
            String backupPosture,
            List<BetaScope.App> starterApps) {
    }

    public record OnboardingUpdateRequest(
            String status,
            Integer currentStep,
            String deviceName,
            String backupDestination,
            Boolean automaticBackupsEnabled,
            String privateAccessChoice,
            List<String> recommendedApps,
            List<String> completedSteps,
            String backupPosture,
            Boolean acknowledgeOptionalWork) {
        public OnboardingUpdateRequest(String status, Integer currentStep, String deviceName, String backupDestination,
                Boolean automaticBackupsEnabled, String privateAccessChoice, List<String> recommendedApps, List<String> completedSteps) {
            this(status, currentStep, deviceName, backupDestination, automaticBackupsEnabled, privateAccessChoice, recommendedApps, completedSteps, null, null);
        }
    }

    public record OnboardingCompletionRequest(boolean acknowledgeOptionalWork) { }
}
