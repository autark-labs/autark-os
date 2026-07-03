package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class SystemSummaryControllerTests {

    @Test
    void returnsSystemSummaryPayload() {
        SystemSummary summary = new SystemSummary(
                "autark-os-test",
                "pos_test",
                "http://localhost:8082",
                new SetupProgressSummary(true, "ready", "done", "Setup is complete."),
                new DockerSummary(true, "Docker is ready."),
                new AccessSummary("local_only", "Local access is ready."),
                new AppsSummary(0, 0, 0, List.of()),
                new BackupSummary("not_configured", "No restore point is required yet."),
                new StorageSummary("unknown", "Storage details are available from the Storage page."),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));

        SystemSummaryController controller = new SystemSummaryController(() -> summary);

        assertThat(controller.summary()).isEqualTo(summary);
    }
}
