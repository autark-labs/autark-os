package com.projectos.backups;

import java.util.List;

public record BackupContract(
        String strategy,
        String label,
        String confidence,
        boolean reviewRequired,
        String summary,
        List<String> details) {
}
