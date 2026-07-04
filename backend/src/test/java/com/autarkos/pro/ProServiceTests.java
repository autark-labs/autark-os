package com.autarkos.pro;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.RecordComponent;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.models.ProModels;
import com.autarkos.pro.models.ProRemoteModels;
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

    @Test
    void registerInstallStoresRemoteIdentityAndReturnsPublicStatus() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        RecordingRemoteClient remoteClient = new RecordingRemoteClient();
        ProService service = new ProService(
                repository,
                () -> Instant.parse("2026-07-04T12:00:00Z"),
                false,
                remoteClient,
                () -> "1.2.3");

        ProModels.ProStatus status = service.registerInstall();

        assertThat(status.enabled()).isTrue();
        assertThat(status.mode()).isEqualTo("free");
        assertThat(status.registered()).isTrue();
        assertThat(status.installId()).isEqualTo("ins_story_4");
        assertThat(status.entitlementStatus()).isEqualTo("none");
        assertThat(status.remoteApiConfigured()).isFalse();
        assertThat(repository.settings()).hasValueSatisfying(settings -> {
            assertThat(settings.installId()).isEqualTo("ins_story_4");
            assertThat(settings.installTokenProtected()).isEqualTo("tok_story_4");
            assertThat(settings.updatedAt()).isEqualTo(Instant.parse("2026-07-04T12:00:00Z"));
        });
        assertThat(remoteClient.registerCalls.get()).isEqualTo(1);
        assertThat(remoteClient.lastRegisterRequest.clientName()).isEqualTo("Autark-OS");
        assertThat(remoteClient.lastRegisterRequest.autarkVersion()).isEqualTo("1.2.3");
        assertThat(remoteClient.lastRegisterRequest.agentVersion()).isEqualTo("1.2.3");
        assertThat(remoteClient.lastRegisterRequest.platform()).isNotBlank();
        assertThat(publicStatusFields()).doesNotContain("installToken", "installTokenProtected");
    }

    @Test
    void registerInstallIsIdempotentWhenAlreadyRegistered() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        Instant createdAt = Instant.parse("2026-07-04T10:00:00Z");
        repository.saveSettings(new ProModels.ProSettings(
                true,
                "free",
                "ins_existing",
                "tok_existing",
                false,
                null,
                null,
                "none",
                null,
                true,
                true,
                true,
                false,
                null,
                null,
                null,
                null,
                createdAt,
                createdAt));
        RecordingRemoteClient remoteClient = new RecordingRemoteClient();
        ProService service = new ProService(
                repository,
                () -> Instant.parse("2026-07-04T12:00:00Z"),
                true,
                remoteClient,
                () -> "1.2.3");

        ProModels.ProStatus status = service.registerInstall();

        assertThat(status.enabled()).isTrue();
        assertThat(status.registered()).isTrue();
        assertThat(status.installId()).isEqualTo("ins_existing");
        assertThat(status.remoteApiConfigured()).isTrue();
        assertThat(remoteClient.registerCalls.get()).isZero();
        assertThat(repository.settings()).hasValueSatisfying(settings -> {
            assertThat(settings.installTokenProtected()).isEqualTo("tok_existing");
            assertThat(settings.updatedAt()).isEqualTo(createdAt);
        });
    }

    @Test
    void redeemLicenseActivatesAccountlessProForRegisteredInstall() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        Instant createdAt = Instant.parse("2026-07-04T10:00:00Z");
        repository.saveSettings(new ProModels.ProSettings(
                true,
                "free",
                "ins_registered",
                "tok_registered",
                false,
                null,
                null,
                "none",
                null,
                true,
                true,
                true,
                false,
                null,
                null,
                null,
                null,
                createdAt,
                createdAt));
        RecordingRemoteClient remoteClient = new RecordingRemoteClient();
        ProService service = new ProService(
                repository,
                () -> Instant.parse("2026-07-04T12:30:00Z"),
                false,
                remoteClient,
                () -> "1.2.3");

        ProModels.ProStatus status = service.redeemLicense(" AUTARK-PRO-TEST-0001 ");

        assertThat(status.enabled()).isTrue();
        assertThat(status.mode()).isEqualTo("accountless");
        assertThat(status.registered()).isTrue();
        assertThat(status.installId()).isEqualTo("ins_registered");
        assertThat(status.plan()).isEqualTo("autark_pro_test");
        assertThat(status.entitlementStatus()).isEqualTo("active");
        assertThat(status.entitlementExpiresAt()).isEqualTo(Instant.parse("2027-07-04T00:00:00Z"));
        assertThat(status.lastEntitlementCheckAt()).isEqualTo(Instant.parse("2026-07-04T12:30:00Z"));
        assertThat(remoteClient.redeemCalls.get()).isEqualTo(1);
        assertThat(remoteClient.lastRedeemRequest.installId()).isEqualTo("ins_registered");
        assertThat(remoteClient.lastRedeemRequest.licenseCode()).isEqualTo("AUTARK-PRO-TEST-0001");
        assertThat(repository.settings()).hasValueSatisfying(settings -> {
            assertThat(settings.installTokenProtected()).isEqualTo("tok_registered");
            assertThat(settings.mode()).isEqualTo("accountless");
            assertThat(settings.plan()).isEqualTo("autark_pro_test");
        });
    }

    @Test
    void redeemLicenseAutoRegistersFreshInstallInLocalMockMode() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        RecordingRemoteClient remoteClient = new RecordingRemoteClient();
        ProService service = new ProService(
                repository,
                () -> Instant.parse("2026-07-04T12:30:00Z"),
                false,
                remoteClient,
                () -> "1.2.3");

        ProModels.ProStatus status = service.redeemLicense("AUTARK-PRO-TEST-0001");

        assertThat(status.enabled()).isTrue();
        assertThat(status.mode()).isEqualTo("accountless");
        assertThat(status.installId()).isEqualTo("ins_story_4");
        assertThat(remoteClient.registerCalls.get()).isEqualTo(1);
        assertThat(remoteClient.redeemCalls.get()).isEqualTo(1);
    }

    @Test
    void redeemLicenseRejectsInvalidLicenseWithProSpecificCopy() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        repository.saveSettings(ProModels.ProSettings.defaults(Instant.parse("2026-07-04T10:00:00Z")));
        RecordingRemoteClient remoteClient = new RecordingRemoteClient();
        ProService service = new ProService(
                repository,
                () -> Instant.parse("2026-07-04T12:30:00Z"),
                false,
                remoteClient,
                () -> "1.2.3");

        assertThatThrownBy(() -> service.redeemLicense("NOPE"))
                .isInstanceOf(ProRemoteException.class)
                .hasMessageContaining("Autark Pro could not activate that license");

        assertThat(remoteClient.registerCalls.get()).isEqualTo(1);
        assertThat(remoteClient.redeemCalls.get()).isEqualTo(1);
        assertThat(repository.settings()).hasValueSatisfying(settings -> {
            assertThat(settings.mode()).isEqualTo("free");
            assertThat(settings.entitlementStatus()).isEqualTo("none");
        });
    }

    @Test
    void privacyPayloadPreviewWorksBeforeRegistrationAndExcludesForbiddenFields() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProService service = new ProService(repository, () -> Instant.parse("2026-07-04T12:30:00Z"), false);

        ProModels.ProPrivacyPayloadPreview preview = service.privacyPayloadPreview();

        assertThat(preview.payload()).containsEntry("installId", null);
        assertThat(preview.payload()).containsEntry("generatedAt", Instant.parse("2026-07-04T12:30:00Z"));
        assertThat(preview.payload()).containsEntry("autarkVersion", "0.0.1-SNAPSHOT");
        assertThat(preview.payload()).containsEntry("agentVersion", "0.0.1-SNAPSHOT");
        assertThat(preview.payload()).containsKeys("coarseSystemHealth", "diskUsagePercent", "memoryUsagePercent", "appHealthCounts", "backupStatusSummary", "updateStatusSummary");
        assertThat(preview.payload()).containsEntry("updateStatusSummary", null);
        assertThat(preview.maySend()).contains("install ID", "coarse system health", "app health counts", "backup status summary");
        assertThat(preview.neverSends()).contains("user files", "raw logs", "secrets", "private keys", "full network map");
        assertThat(serialized(preview.payload()))
                .doesNotContainIgnoringCase("token")
                .doesNotContainIgnoringCase("secret")
                .doesNotContainIgnoringCase("privateKey")
                .doesNotContainIgnoringCase("rawLog")
                .doesNotContainIgnoringCase("fileName")
                .doesNotContainIgnoringCase("dnsHistory")
                .doesNotContainIgnoringCase("networkMap");
    }

    @Test
    void privacyPayloadPreviewUsesRegisteredInstallIdWithoutExposingToken() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        Instant createdAt = Instant.parse("2026-07-04T10:00:00Z");
        repository.saveSettings(new ProModels.ProSettings(
                true,
                "free",
                "ins_registered",
                "tok_registered",
                false,
                null,
                null,
                "none",
                null,
                true,
                true,
                true,
                false,
                null,
                null,
                null,
                null,
                createdAt,
                createdAt));
        ProService service = new ProService(repository, () -> Instant.parse("2026-07-04T12:30:00Z"), false);

        ProModels.ProPrivacyPayloadPreview preview = service.privacyPayloadPreview();

        assertThat(preview.payload()).containsEntry("installId", "ins_registered");
        assertThat(serialized(preview.payload())).doesNotContain("tok_registered");
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

    private static String serialized(Object value) {
        return String.valueOf(value);
    }

    private static class RecordingRemoteClient implements ProRemoteClient {
        private final AtomicInteger registerCalls = new AtomicInteger();
        private final AtomicInteger redeemCalls = new AtomicInteger();
        private ProRemoteModels.RegisterInstallRequest lastRegisterRequest;
        private ProRemoteModels.RedeemLicenseRequest lastRedeemRequest;

        @Override
        public ProRemoteModels.RegisterInstallResponse registerInstall(ProRemoteModels.RegisterInstallRequest request) {
            registerCalls.incrementAndGet();
            lastRegisterRequest = request;
            return new ProRemoteModels.RegisterInstallResponse(
                    "ins_story_4",
                    "tok_story_4",
                    Instant.parse("2026-07-04T12:00:00Z"));
        }

        @Override
        public ProRemoteModels.RedeemLicenseResponse redeemLicense(ProRemoteModels.RedeemLicenseRequest request) {
            redeemCalls.incrementAndGet();
            lastRedeemRequest = request;
            if (request.licenseCode() != null && request.licenseCode().startsWith("AUTARK-PRO-")) {
                return new ProRemoteModels.RedeemLicenseResponse(
                        "autark_pro_test",
                        "active",
                        Instant.parse("2027-07-04T00:00:00Z"),
                        "License accepted.");
            }
            return new ProRemoteModels.RedeemLicenseResponse(
                    null,
                    "none",
                    null,
                    "This license code was not accepted.");
        }

        @Override
        public ProRemoteModels.HeartbeatResponse submitHeartbeat(ProRemoteModels.HeartbeatRequest request) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ProRemoteModels.ProFeedResponse proFeed(Instant since) {
            throw new UnsupportedOperationException();
        }
    }
}
