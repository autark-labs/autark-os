package com.autarkos.pro.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class ProContractPolicyTests {

    private static final String DEVICE_ID = "11111111-1111-4111-8111-111111111111";
    private static final String INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
    private static final String FINGERPRINT = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final Instant ISSUED_AT = Instant.parse("2026-07-19T12:00:00Z");
    private static final Instant UPDATES_THROUGH = Instant.parse("2029-07-19T12:00:00Z");

    @Test
    void validGrantAndLeaseProduceActiveState() {
        ProEntitlementStatus status = evaluate(grant(UPDATES_THROUGH), lease("active", Instant.parse("2026-07-20T12:00:00Z")),
                ISSUED_AT, null, true, true, DEVICE_ID);

        assertThat(status.state()).isEqualTo(ProEntitlementState.ACTIVE);
        assertThat(status.localUseAllowed()).isTrue();
        assertThat(status.updatesAllowed()).isTrue();
        assertThat(status.hostedServicesAllowed()).isTrue();
    }

    @Test
    void elapsedMaintenanceProducesRetainedUseRatherThanRevocation() {
        ProEntitlementStatus status = evaluate(grant(Instant.parse("2026-07-18T12:00:00Z")),
                lease("active", Instant.parse("2026-07-20T12:00:00Z")),
                ISSUED_AT, null, true, true, DEVICE_ID);

        assertThat(status.state()).isEqualTo(ProEntitlementState.RETAINED_USE);
        assertThat(status.reasonCode()).isEqualTo("maintenance_ended");
        assertThat(status.localUseAllowed()).isTrue();
        assertThat(status.updatesAllowed()).isFalse();
        assertThat(status.hostedServicesAllowed()).isFalse();
    }

    @Test
    void cachedReleasePublishedBeforeMaintenanceEndRemainsRunnable() {
        DurableProductGrant expiredGrant = grant(Instant.parse("2026-07-18T12:00:00Z"));

        assertThat(ProContractPolicy.canRunRetainedRelease(expiredGrant,
                manifest(Instant.parse("2026-07-18T12:00:00Z"), Instant.parse("2026-07-25T12:00:00Z")))).isTrue();
        assertThat(ProContractPolicy.canRunRetainedRelease(expiredGrant,
                manifest(Instant.parse("2026-07-18T12:00:00.001Z"), Instant.parse("2026-07-25T12:00:00Z")))).isFalse();
    }

    @Test
    void registryAuthorizationFailsForPostMaintenanceRelease() {
        DurableProductGrant activeGrant = grant(UPDATES_THROUGH);
        ProEntitlementStatus active = evaluate(activeGrant, lease("active", Instant.parse("2026-07-20T12:00:00Z")),
                ISSUED_AT, null, true, true, DEVICE_ID);

        assertThat(ProContractPolicy.canAuthorizeNewDownload(
                active,
                activeGrant,
                manifest(UPDATES_THROUGH.plusMillis(1), Instant.parse("2029-07-20T12:00:00Z")),
                ISSUED_AT)).isFalse();
    }

    @Test
    void expiredLeaseEntersGraceWithoutAuthorizingDownloads() {
        DurableProductGrant activeGrant = grant(UPDATES_THROUGH);
        Instant now = Instant.parse("2026-07-21T12:00:00Z");
        ProEntitlementStatus status = evaluate(activeGrant, lease("active", Instant.parse("2026-07-20T12:00:00Z")),
                now, null, true, true, DEVICE_ID);

        assertThat(status.state()).isEqualTo(ProEntitlementState.ONLINE_GRACE);
        assertThat(status.localUseAllowed()).isTrue();
        assertThat(status.updatesAllowed()).isFalse();
        assertThat(ProContractPolicy.canAuthorizeNewDownload(
                status,
                activeGrant,
                manifest(ISSUED_AT, Instant.parse("2026-07-26T12:00:00Z")),
                now)).isFalse();
    }

    @Test
    void invalidSignatureAndDeviceMismatchFailClosed() {
        ProEntitlementStatus invalidSignature = evaluate(grant(UPDATES_THROUGH), null,
                ISSUED_AT, null, false, true, DEVICE_ID);
        ProEntitlementStatus wrongDevice = evaluate(grant(UPDATES_THROUGH), null,
                ISSUED_AT, null, true, true, "99999999-9999-4999-8999-999999999999");

        assertThat(invalidSignature.state()).isEqualTo(ProEntitlementState.INVALID);
        assertThat(invalidSignature.localUseAllowed()).isFalse();
        assertThat(wrongDevice.state()).isEqualTo(ProEntitlementState.INVALID);
        assertThat(wrongDevice.reasonCode()).isEqualTo("device_mismatch");
    }

    @Test
    void trustedServerCheckpointPreventsClockRollbackFromExtendingLease() {
        Instant leaseExpiry = Instant.parse("2026-07-20T12:00:00Z");
        Instant verifiedServerTime = Instant.parse("2026-08-15T12:00:00Z");
        ProEntitlementStatus status = evaluate(grant(UPDATES_THROUGH), lease("active", leaseExpiry),
                ISSUED_AT, verifiedServerTime, true, true, DEVICE_ID);

        assertThat(status.state()).isEqualTo(ProEntitlementState.SUSPENDED_ONLINE);
        assertThat(status.hostedServicesAllowed()).isFalse();
        assertThat(status.lastVerifiedServerTime()).isEqualTo(verifiedServerTime);
    }

    @Test
    void unknownSchemaVersionFailsClosed() {
        DurableProductGrant grant = new DurableProductGrant(
                "2",
                "33333333-3333-4333-8333-333333333333",
                DEVICE_ID,
                INSTALLATION_ID,
                FINGERPRINT,
                "pro_home",
                features(),
                "staging",
                "autark-pro-staging",
                ISSUED_AT,
                UPDATES_THROUGH,
                "perpetual",
                "staging-entitlement-2026-01");

        ProEntitlementStatus status = evaluate(grant, null, ISSUED_AT, null, true, true, DEVICE_ID);

        assertThat(status.state()).isEqualTo(ProEntitlementState.INVALID);
        assertThat(status.reasonCode()).isEqualTo("unknown_schema");
    }

    private ProEntitlementStatus evaluate(
            DurableProductGrant grant,
            OnlineServiceLease lease,
            Instant now,
            Instant lastVerifiedServerTime,
            boolean grantSignatureValid,
            boolean leaseSignatureValid,
            String expectedDeviceId) {
        return ProContractPolicy.evaluate(
                grant,
                grantSignatureValid,
                false,
                lease,
                leaseSignatureValid,
                expectedDeviceId,
                FINGERPRINT,
                now,
                lastVerifiedServerTime,
                Duration.ofDays(14),
                "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    }

    private DurableProductGrant grant(Instant updatesThrough) {
        return new DurableProductGrant(
                "1",
                "33333333-3333-4333-8333-333333333333",
                DEVICE_ID,
                INSTALLATION_ID,
                FINGERPRINT,
                "pro_home",
                features(),
                "staging",
                "autark-pro-staging",
                ISSUED_AT,
                updatesThrough,
                "perpetual",
                "staging-entitlement-2026-01");
    }

    private OnlineServiceLease lease(String status, Instant expiresAt) {
        return new OnlineServiceLease(
                "1",
                "44444444-4444-4444-8444-444444444444",
                "33333333-3333-4333-8333-333333333333",
                DEVICE_ID,
                FINGERPRINT,
                features(),
                List.of("release-check", "registry"),
                status,
                "autark-pro-staging",
                ISSUED_AT,
                ISSUED_AT.plus(Duration.ofHours(12)),
                expiresAt,
                ISSUED_AT,
                "staging-entitlement-2026-01");
    }

    private ProReleaseManifest manifest(Instant publishedAt, Instant expiresAt) {
        return new ProReleaseManifest(
                "1",
                7,
                ISSUED_AT,
                expiresAt,
                "staging",
                "autark-pro-agent",
                "0.1.0",
                "registry.staging.autarklabs.com/autark-pro-agent",
                "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                "linux/amd64",
                publishedAt,
                "0.1.0",
                null,
                "1.x",
                "prototype",
                features(),
                "staging-release-2026-01");
    }

    private List<String> features() {
        return List.of(
                "autark-pro.extension");
    }
}
