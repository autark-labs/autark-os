package com.autarkos.activity;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
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

    @BeforeEach
    void clearActivity() {
        repository.deleteAll();
    }

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

    @Test
    void notificationHistoryIsPersistedRedactedFilteredAndRetrySafe() {
        var request = new ActivityController.NotificationRequest("receipt-1", "error", "Access failed",
                "token=super-secret at http://192.168.1.20:8080/");
        var saved = service.notification(request);
        assertThat(service.notification(request).id()).isEqualTo(saved.id());
        service.info("system", "check", "Unrelated system event", "Checked");

        // A new reader must see the saved database record, without browser/session state.
        var reader = new ActivityLogService(repository);
        assertThat(reader.recent(100, null, "notification", null, null)).singleElement().satisfies(log -> {
            assertThat(log.id()).isEqualTo(saved.id());
            assertThat(log.action()).isEqualTo("notification:receipt-1");
            assertThat(log.level()).isEqualTo("error");
            assertThat(log.message()).doesNotContain("super-secret", "192.168.1.20");
        });
        assertThat(repository.count()).isEqualTo(2);
    }
}
