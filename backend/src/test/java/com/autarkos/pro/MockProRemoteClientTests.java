package com.autarkos.pro;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.autarkos.pro.models.ProRemoteModels;

class MockProRemoteClientTests {

    private final MockProRemoteClient client = new MockProRemoteClient();

    @Test
    void registerInstallReturnsDurableMockIdentity() {
        ProRemoteModels.RegisterInstallResponse response = client.registerInstall(new ProRemoteModels.RegisterInstallRequest(
                "Autark-OS",
                "0.0.1",
                "0.0.1",
                "linux-x86_64",
                null));

        assertThat(response.installId()).startsWith("mock-install-");
        assertThat(response.installToken()).isNotBlank();
        assertThat(response.registeredAt()).isNotNull();
    }

    @Test
    void redeemLicenseAcceptsAutarkProCodesAndRejectsOtherCodes() {
        ProRemoteModels.RedeemLicenseResponse accepted = client.redeemLicense(new ProRemoteModels.RedeemLicenseRequest(
                "mock-install-123",
                "AUTARK-PRO-TEST-0001"));

        assertThat(accepted.plan()).isEqualTo("autark_pro_mock");
        assertThat(accepted.entitlementStatus()).isEqualTo("active");
        assertThat(accepted.entitlementExpiresAt()).isAfter(Instant.parse("2026-07-04T00:00:00Z"));

        ProRemoteModels.RedeemLicenseResponse rejected = client.redeemLicense(new ProRemoteModels.RedeemLicenseRequest(
                "mock-install-123",
                "NOPE"));

        assertThat(rejected.entitlementStatus()).isEqualTo("none");
        assertThat(rejected.userMessage()).contains("was not accepted");
    }

    @Test
    void heartbeatAndFeedReturnMockOperationalData() {
        ProRemoteModels.HeartbeatResponse heartbeat = client.submitHeartbeat(new ProRemoteModels.HeartbeatRequest(
                "mock-install-123",
                Instant.parse("2026-07-04T10:00:00Z"),
                Map.of("appsReady", 3)));
        ProRemoteModels.ProFeedResponse feed = client.proFeed(Instant.parse("2026-07-04T09:00:00Z"));

        assertThat(heartbeat.result()).isEqualTo("accepted");
        assertThat(feed.items()).isNotEmpty();
        assertThat(feed.syncedAt()).isNotNull();
    }
}
