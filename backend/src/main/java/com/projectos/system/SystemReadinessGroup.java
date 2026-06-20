package com.projectos.system;

import java.util.List;

public record SystemReadinessGroup(
        String id,
        String label,
        String status,
        String message,
        List<SystemSetupCheck> checks) {
}
