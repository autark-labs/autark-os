package com.autarkos.host;

import java.util.List;

public record ObservedServiceAdoptionPlan(
        String serviceId,
        boolean available,
        String summary,
        List<String> containers,
        String catalogAppId,
        List<String> labelsToApply,
        boolean restartRequired,
        String dataPreservation,
        List<String> warnings,
        String disabledReason,
        String confirmationText,
        List<String> steps,
        List<String> blockedReasons) {
}
