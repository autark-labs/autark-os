package com.autarkos.activity;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(properties = {
        "autark-os.guardian.enabled=false",
        "autark-os.backups.scheduler.enabled=false"
})
class ActivityLogRepositoryTests {

    @TempDir
    static Path runtimeRoot;

    @Autowired
    ActivityLogRepository repository;

    @Autowired
    ActivityLogService service;

    @DynamicPropertySource
    static void runtimeProperties(DynamicPropertyRegistry registry) {
        registry.add("autark-os.runtime-root", () -> runtimeRoot.toString());
    }

    @Test
    void recordsAndReadsRecentActivity() {
        service.success("marketplace", "install_completed", "Installed Vaultwarden", "Vaultwarden is ready.", "vaultwarden");

        assertThat(service.recent(10))
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.level()).isEqualTo("success");
                    assertThat(log.category()).isEqualTo("marketplace");
                    assertThat(log.action()).isEqualTo("install_completed");
                    assertThat(log.appId()).isEqualTo("vaultwarden");
                });
    }
}
