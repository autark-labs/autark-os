package com.projectos.backups;

import java.time.Instant;
import java.util.List;

public record RestoreSimulationResult(
        String status,
        String message,
        List<String> details,
        Instant simulatedAt) {
}
