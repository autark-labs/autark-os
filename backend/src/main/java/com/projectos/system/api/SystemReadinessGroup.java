package com.projectos.system.api;

import java.util.List;

public record SystemReadinessGroup(
        String id,
        String label,
        String status,
        String message,
        List<SystemSetupCheck> checks) {
}
