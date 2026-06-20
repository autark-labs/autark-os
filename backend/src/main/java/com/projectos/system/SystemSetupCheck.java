package com.projectos.system;

public record SystemSetupCheck(
        String id,
        String label,
        String status,
        String message,
        String detail,
        String actionLabel,
        String actionCommand) {
}
