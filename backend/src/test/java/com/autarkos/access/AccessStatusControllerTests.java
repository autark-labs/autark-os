package com.autarkos.access;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class AccessStatusControllerTests {

    @Test
    void returnsAccessStatusPayload() {
        AccessStatus status = new AccessStatus(
                "local_only",
                "http://host:8082",
                new AccessTailscaleStatus(false, false, "", false, false, false, "unavailable"),
                List.of(),
                List.of(),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));
        AccessStatusController controller = new AccessStatusController(new AccessStatusService(
                () -> List.of(),
                () -> com.autarkos.network.tailscale.TailscaleStatus.notInstalled(),
                () -> "http://host:8082",
                () -> Instant.parse("2026-06-20T12:00:00Z")));

        assertThat(controller.status()).isEqualTo(status);
    }
}
