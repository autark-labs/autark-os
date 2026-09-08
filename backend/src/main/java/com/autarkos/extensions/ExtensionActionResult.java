package com.autarkos.extensions;

import java.time.Instant;
import java.time.Duration;
import java.util.Set;
import com.fasterxml.jackson.databind.JsonNode;
import com.autarkos.pro.agent.ProAgentClientException;

public record ExtensionActionResult(String schemaVersion, String outcome, JsonNode payload, Summary summary) {
    public record Summary(Instant asOf, int activeFindingCount, String highestSeverity) { }

    public void validate() {
        if (!"1".equals(schemaVersion) || outcome == null
                || !Set.of("completed", "conflict", "not_found", "invalid").contains(outcome)
                || payload == null || !payload.isObject()
                || (summary != null && (summary.asOf() == null
                    || summary.asOf().isAfter(Instant.now().plus(Duration.ofMinutes(5)))
                    || summary.asOf().isBefore(Instant.now().minus(Duration.ofMinutes(5)))
                    || summary.activeFindingCount() < 0 || summary.activeFindingCount() > 500
                    || summary.highestSeverity() == null
                    || !Set.of("none", "info", "low", "medium", "high", "critical").contains(summary.highestSeverity())
                    || ((summary.activeFindingCount() == 0) != "none".equals(summary.highestSeverity()))))) {
            throw new ProAgentClientException("agent_response_invalid", "The extension action response is invalid.");
        }
    }
}
