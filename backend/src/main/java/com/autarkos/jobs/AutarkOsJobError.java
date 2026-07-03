package com.autarkos.jobs;

import java.util.Map;

public record AutarkOsJobError(
        String code,
        String message,
        Map<String, String> advancedDetails) {
}
