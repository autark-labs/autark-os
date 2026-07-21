package com.autarkos.pro.entitlement;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DevicePublicKey;
import com.autarkos.pro.model.DurableProductGrant;
import com.autarkos.pro.model.OnlineServiceLease;
import com.autarkos.pro.model.ProEntitlementState;

class ProEntitlementStateReducerTests {

    private static final Instant ISSUED_AT =
            Instant.parse("2026-07-19T12:00:00Z");
    private static final String FINGERPRINT =
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    private final ProEntitlementStateReducer reducer =
            new ProEntitlementStateReducer();

    @Test
    void restoresActiveVerifiedStateWithoutNetworkAccess() {
        var status = reducer.reduce(
                verifiedGrant(),
                verifiedLease(),
                identity(),
                ISSUED_AT.plus(Duration.ofHours(2)),
                ISSUED_AT,
                Duration.ofDays(14));

        assertThat(status.state()).isEqualTo(ProEntitlementState.ACTIVE);
        assertThat(status.localUseAllowed()).isTrue();
        assertThat(status.hostedServicesAllowed()).isTrue();
    }

    @Test
    void clockRollbackCannotExtendLeaseGrace() {
        Instant checkpoint = ISSUED_AT.plus(Duration.ofDays(20));

        var status = reducer.reduce(
                verifiedGrant(),
                verifiedLease(),
                identity(),
                ISSUED_AT.minus(Duration.ofDays(30)),
                checkpoint,
                Duration.ofDays(14));

        assertThat(status.state())
                .isEqualTo(ProEntitlementState.SUSPENDED_ONLINE);
        assertThat(status.hostedServicesAllowed()).isFalse();
        assertThat(status.lastVerifiedServerTime()).isEqualTo(checkpoint);
    }

    private static GrantVerifier.VerifiedGrant verifiedGrant() {
        return new GrantVerifier.VerifiedGrant(
                new DurableProductGrant(
                        "1",
                        "33333333-3333-4333-8333-333333333333",
                        identity().deviceId(),
                        identity().installationId(),
                        FINGERPRINT,
                        "pro_home",
                        List.of("autark-pro.extension"),
                        "staging",
                        "autark-pro-test",
                        ISSUED_AT,
                        ISSUED_AT.plus(Duration.ofDays(365 * 3L)),
                        "perpetual",
                        "test-key"),
                fingerprint('b'),
                "test-key");
    }

    private static ServiceLeaseVerifier.VerifiedLease verifiedLease() {
        return new ServiceLeaseVerifier.VerifiedLease(
                new OnlineServiceLease(
                        "1",
                        "44444444-4444-4444-8444-444444444444",
                        verifiedGrant().grant().grantId(),
                        identity().deviceId(),
                        FINGERPRINT,
                        List.of("autark-pro.extension"),
                        List.of("release-check"),
                        "active",
                        "autark-pro-test",
                        ISSUED_AT,
                        ISSUED_AT.plus(Duration.ofHours(12)),
                        ISSUED_AT.plus(Duration.ofHours(24)),
                        ISSUED_AT,
                        "test-key"),
                fingerprint('c'),
                "test-key");
    }

    private static DeviceIdentity identity() {
        return new DeviceIdentity(
                "1",
                "11111111-1111-4111-8111-111111111111",
                "22222222-2222-4222-8222-222222222222",
                "Ed25519",
                "device-key",
                new DevicePublicKey(
                        "OKP",
                        "Ed25519",
                        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
                FINGERPRINT,
                ISSUED_AT,
                ISSUED_AT);
    }

    private static String fingerprint(char value) {
        return "sha256:" + String.valueOf(value).repeat(64);
    }
}
