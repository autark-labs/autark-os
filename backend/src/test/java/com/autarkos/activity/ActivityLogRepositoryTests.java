package com.autarkos.activity;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class ActivityLogRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void recordsAndReadsRecentActivity() {
        ActivityLogRepository repository = new ActivityLogRepository(runtimeLayout());

        repository.record("success", "marketplace", "install_completed", "Installed Vaultwarden", "Vaultwarden is ready.", "vaultwarden", "completed", "durationMs=1200");

        assertThat(repository.recent(10))
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.level()).isEqualTo("success");
                    assertThat(log.category()).isEqualTo("marketplace");
                    assertThat(log.action()).isEqualTo("install_completed");
                    assertThat(log.appId()).isEqualTo("vaultwarden");
                    assertThat(log.details()).isEqualTo("durationMs=1200");
                });
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
