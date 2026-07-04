package com.autarkos.pro;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.RecordComponent;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.models.ProModels;
import com.autarkos.testsupport.JpaTestRepositories;

class ProServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void returnsFreeUnregisteredStatusForFreshInstall() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProService service = new ProService(repository, () -> Instant.parse("2026-07-04T10:00:00Z"), false);

        ProModels.ProStatus status = service.status();

        assertThat(status.enabled()).isFalse();
        assertThat(status.mode()).isEqualTo("free");
        assertThat(status.registered()).isFalse();
        assertThat(status.installId()).isNull();
        assertThat(status.accountLinked()).isFalse();
        assertThat(status.entitlementStatus()).isEqualTo("none");
        assertThat(status.healthReportingEnabled()).isTrue();
        assertThat(status.alertsEnabled()).isTrue();
        assertThat(status.proFeedEnabled()).isTrue();
        assertThat(status.configSnapshotEnabled()).isFalse();
        assertThat(status.lastHeartbeatAt()).isNull();
        assertThat(status.lastHeartbeatResult()).isNull();
        assertThat(status.remoteApiConfigured()).isFalse();
        assertThat(status.remoteApiHealthy()).isNull();
    }

    @Test
    void persistsProSettingsAndProjectsPublicStatusWithoutToken() {
        RuntimeLayout layout = runtimeLayout();
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(layout);
        Instant createdAt = Instant.parse("2026-07-04T10:00:00Z");
        Instant updatedAt = Instant.parse("2026-07-04T11:00:00Z");
        ProModels.ProSettings settings = new ProModels.ProSettings(
                true,
                "accountless",
                "ins_test_123",
                "secret-install-token",
                false,
                null,
                "pro_home",
                "active",
                Instant.parse("2027-07-04T00:00:00Z"),
                true,
                false,
                true,
                false,
                Instant.parse("2026-07-04T10:30:00Z"),
                "accepted",
                Instant.parse("2026-07-04T10:15:00Z"),
                Instant.parse("2026-07-04T10:45:00Z"),
                createdAt,
                updatedAt);

        repository.saveSettings(settings);

        assertThat(repository.settings()).hasValueSatisfying(saved -> {
            assertThat(saved.installId()).isEqualTo("ins_test_123");
            assertThat(saved.installTokenProtected()).isEqualTo("secret-install-token");
            assertThat(saved.plan()).isEqualTo("pro_home");
            assertThat(saved.entitlementStatus()).isEqualTo("active");
            assertThat(saved.updatedAt()).isEqualTo(updatedAt);
        });

        ProModels.ProStatus status = new ProService(repository, () -> Instant.parse("2026-07-04T12:00:00Z"), true).status();

        assertThat(status.enabled()).isTrue();
        assertThat(status.mode()).isEqualTo("accountless");
        assertThat(status.registered()).isTrue();
        assertThat(status.installId()).isEqualTo("ins_test_123");
        assertThat(status.plan()).isEqualTo("pro_home");
        assertThat(status.entitlementStatus()).isEqualTo("active");
        assertThat(status.entitlementExpiresAt()).isEqualTo(Instant.parse("2027-07-04T00:00:00Z"));
        assertThat(status.alertsEnabled()).isFalse();
        assertThat(status.lastHeartbeatResult()).isEqualTo("accepted");
        assertThat(status.remoteApiConfigured()).isTrue();
        assertThat(publicStatusFields()).doesNotContain("installToken", "installTokenProtected");
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static java.util.List<String> publicStatusFields() {
        return Arrays.stream(ProModels.ProStatus.class.getRecordComponents())
                .map(RecordComponent::getName)
                .toList();
    }
}
