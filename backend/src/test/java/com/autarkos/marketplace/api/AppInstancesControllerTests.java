package com.autarkos.marketplace.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.AppInstanceView;

class AppInstancesControllerTests {

    @Test
    void returnsCanonicalAppInstanceViews() {
        AppInstanceView view = new AppInstanceView(
                "appinst_vaultwarden",
                "vaultwarden",
                "Vaultwarden",
                "Security",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                "local_ready",
                "backup_disabled",
                "http://localhost:8090",
                null,
                List.of(),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));

        AppInstancesController controller = new AppInstancesController(() -> List.of(view));

        assertThat(controller.appInstances()).containsExactly(view);
    }
}
