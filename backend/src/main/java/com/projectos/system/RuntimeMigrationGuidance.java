package com.projectos.system;

import java.util.List;

public record RuntimeMigrationGuidance(
        String currentRuntimePath,
        String status,
        String summary,
        List<String> steps) {
}
