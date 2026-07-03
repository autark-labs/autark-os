package com.autarkos.system;

public record SetupStatus(
        boolean setupComplete,
        String currentStep,
        String message) {
}
