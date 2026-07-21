package com.autarkos.pro.model;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;

public final class ProContractPolicy {

    public static final String SCHEMA_VERSION = "1";
    public static final String PERPETUAL_LOCAL_USE = "perpetual";

    private ProContractPolicy() {
    }

    public static ProEntitlementStatus evaluate(
            DurableProductGrant grant,
            boolean grantSignatureValid,
            boolean grantRevoked,
            OnlineServiceLease lease,
            boolean leaseSignatureValid,
            String expectedDeviceId,
            String expectedPublicKeyFingerprint,
            Instant localNow,
            Instant lastVerifiedServerTime,
            Duration onlineGrace,
            String grantFingerprint) {
        if (grant == null) {
            return status(ProEntitlementState.NOT_ACTIVATED, null, null, null, lastVerifiedServerTime,
                    false, false, false, null, "not_activated");
        }
        if (!grantSignatureValid) {
            return status(ProEntitlementState.INVALID, grant, lease, null, lastVerifiedServerTime,
                    false, false, false, grantFingerprint, "invalid_signature");
        }
        if (!validGrantContract(grant)) {
            return status(ProEntitlementState.INVALID, grant, lease, null, lastVerifiedServerTime,
                    false, false, false, grantFingerprint, "unknown_schema");
        }
        if (!Objects.equals(expectedDeviceId, grant.deviceId())
                || !Objects.equals(expectedPublicKeyFingerprint, grant.devicePublicKeyFingerprint())) {
            return status(ProEntitlementState.INVALID, grant, lease, null, lastVerifiedServerTime,
                    false, false, false, grantFingerprint, "device_mismatch");
        }
        if (grantRevoked) {
            return status(ProEntitlementState.REVOKED, grant, lease, null, lastVerifiedServerTime,
                    false, false, false, grantFingerprint, "grant_revoked");
        }

        Instant trustedNow = trustedNow(localNow, lastVerifiedServerTime);
        boolean clockRolledBack = localNow.isBefore(trustedNow);
        if (trustedNow.isAfter(grant.updatesThrough())) {
            return status(ProEntitlementState.RETAINED_USE, grant, lease, trustedNow, lastVerifiedServerTime,
                    true, false, false, grantFingerprint, "maintenance_ended");
        }
        if (lease == null) {
            return status(ProEntitlementState.SUSPENDED_ONLINE, grant, null, trustedNow, lastVerifiedServerTime,
                    true, false, false, grantFingerprint, "lease_expired");
        }
        if (!leaseSignatureValid) {
            return status(ProEntitlementState.SUSPENDED_ONLINE, grant, lease, trustedNow, lastVerifiedServerTime,
                    true, false, false, grantFingerprint, "invalid_signature");
        }
        if (!validLeaseContract(grant, lease, expectedDeviceId, expectedPublicKeyFingerprint)) {
            return status(ProEntitlementState.SUSPENDED_ONLINE, grant, lease, trustedNow, lastVerifiedServerTime,
                    true, false, false, grantFingerprint, "device_mismatch");
        }
        if ("revoked".equals(lease.status())) {
            return status(ProEntitlementState.SUSPENDED_ONLINE, grant, lease, trustedNow, lastVerifiedServerTime,
                    true, false, false, grantFingerprint, "lease_revoked");
        }
        if ("suspended".equals(lease.status())) {
            return status(ProEntitlementState.SUSPENDED_ONLINE, grant, lease, trustedNow, lastVerifiedServerTime,
                    true, false, false, grantFingerprint, "lease_suspended");
        }
        if (!trustedNow.isAfter(lease.expiresAt())) {
            return status(ProEntitlementState.ACTIVE, grant, lease, trustedNow, max(lastVerifiedServerTime, lease.serverTime()),
                    true, true, true, grantFingerprint, clockRolledBack ? "clock_rollback" : "none");
        }
        Duration safeGrace = onlineGrace == null || onlineGrace.isNegative() ? Duration.ZERO : onlineGrace;
        if (!trustedNow.isAfter(lease.expiresAt().plus(safeGrace))) {
            return status(ProEntitlementState.ONLINE_GRACE, grant, lease, trustedNow, max(lastVerifiedServerTime, lease.serverTime()),
                    true, false, false, grantFingerprint, "lease_expired");
        }
        return status(ProEntitlementState.SUSPENDED_ONLINE, grant, lease, trustedNow, max(lastVerifiedServerTime, lease.serverTime()),
                true, false, false, grantFingerprint, "lease_expired");
    }

    public static boolean canRunRetainedRelease(DurableProductGrant grant, ProReleaseManifest manifest) {
        return grant != null
                && manifest != null
                && SCHEMA_VERSION.equals(grant.schemaVersion())
                && SCHEMA_VERSION.equals(manifest.schemaVersion())
                && !manifest.publishedAt().isAfter(grant.updatesThrough())
                && grant.features().containsAll(manifest.features());
    }

    public static boolean canAuthorizeNewDownload(
            ProEntitlementStatus status,
            DurableProductGrant grant,
            ProReleaseManifest manifest,
            Instant trustedNow) {
        return status != null
                && status.state() == ProEntitlementState.ACTIVE
                && status.updatesAllowed()
                && canRunRetainedRelease(grant, manifest)
                && !trustedNow.isAfter(manifest.expiresAt());
    }

    private static boolean validGrantContract(DurableProductGrant grant) {
        return SCHEMA_VERSION.equals(grant.schemaVersion())
                && PERPETUAL_LOCAL_USE.equals(grant.localUse())
                && grant.updatesThrough() != null
                && knownUniqueFeatures(grant.features());
    }

    private static boolean validLeaseContract(
            DurableProductGrant grant,
            OnlineServiceLease lease,
            String expectedDeviceId,
            String expectedPublicKeyFingerprint) {
        return SCHEMA_VERSION.equals(lease.schemaVersion())
                && Objects.equals(grant.grantId(), lease.grantId())
                && Objects.equals(expectedDeviceId, lease.deviceId())
                && Objects.equals(expectedPublicKeyFingerprint, lease.devicePublicKeyFingerprint())
                && knownUniqueFeatures(lease.features())
                && grant.features().containsAll(lease.features())
                && List.of("active", "suspended", "revoked").contains(lease.status())
                && lease.expiresAt() != null
                && lease.serverTime() != null;
    }

    private static boolean knownUniqueFeatures(List<String> features) {
        return features != null
                && !features.isEmpty()
                && features.stream().allMatch(value -> value != null
                        && value.matches("^[a-z][a-z0-9.-]{1,127}$"))
                && new HashSet<>(features).size() == features.size();
    }

    private static Instant trustedNow(Instant localNow, Instant lastVerifiedServerTime) {
        Objects.requireNonNull(localNow, "localNow");
        return max(localNow, lastVerifiedServerTime);
    }

    private static Instant max(Instant first, Instant second) {
        if (first == null) {
            return second;
        }
        if (second == null) {
            return first;
        }
        return first.isAfter(second) ? first : second;
    }

    private static ProEntitlementStatus status(
            ProEntitlementState state,
            DurableProductGrant grant,
            OnlineServiceLease lease,
            Instant trustedNow,
            Instant lastVerifiedServerTime,
            boolean localUseAllowed,
            boolean updatesAllowed,
            boolean hostedServicesAllowed,
            String grantFingerprint,
            String reasonCode) {
        Instant serverCheckpoint = max(lastVerifiedServerTime, lease == null ? null : lease.serverTime());
        return new ProEntitlementStatus(
                SCHEMA_VERSION,
                state,
                grant == null ? null : grant.plan(),
                grant == null ? List.of() : List.copyOf(grant.features()),
                grant == null ? null : grant.updatesThrough(),
                lease == null ? null : lease.expiresAt(),
                serverCheckpoint == null ? trustedNow : serverCheckpoint,
                localUseAllowed,
                updatesAllowed,
                hostedServicesAllowed,
                grantFingerprint,
                reasonCode);
    }
}
