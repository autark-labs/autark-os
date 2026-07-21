package com.autarkos.pro.agent;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.autarkos.pro.model.AgentStatus;

@Component
public final class ProAgentContractValidator {

    private static final Pattern SEMVER = Pattern.compile(
            "^[0-9]+\\.[0-9]+\\.[0-9]+"
                    + "(?:-[0-9A-Za-z.-]+)?"
                    + "(?:\\+[0-9A-Za-z.-]+)?$");
    private static final Pattern ERROR_CODE =
            Pattern.compile("^[a-z][a-z0-9_]{0,63}$");

    public void requireStatus(AgentStatus status) {
        if (status == null
                || !"1".equals(status.schemaVersion())
                || !matches(SEMVER, status.componentVersion())
                || !"1".equals(status.apiVersion())
                || !versions(status.supportedSnapshotSchemaVersions())
                || !versions(status.supportedSurfaceSchemaVersions())
                || !Set.of("alive", "ready", "incompatible", "degraded")
                        .contains(status.state())
                || status.ready() != "ready".equals(status.state())
                || !matches(ERROR_CODE, status.reasonCode())
                || status.startedAt() == null) {
            throw new ProAgentClientException(
                    "agent_status_invalid",
                    "The installed extension returned an invalid status.");
        }
    }

    private static boolean versions(List<String> versions) {
        return versions != null
                && !versions.isEmpty()
                && versions.size() <= 16
                && versions.stream().allMatch(value ->
                        value != null && value.matches("^[0-9]+$"));
    }

    private static boolean matches(Pattern pattern, String value) {
        return value != null && pattern.matcher(value).matches();
    }
}
