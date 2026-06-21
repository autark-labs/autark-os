package com.projectos.system;

public record SetupStatus(
        boolean setupComplete,
        String currentStep,
        String message) {
}
