package com.projectos.activity;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

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
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}
