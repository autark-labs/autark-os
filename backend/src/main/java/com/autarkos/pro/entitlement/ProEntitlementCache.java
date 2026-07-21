package com.autarkos.pro.entitlement;

import java.time.Instant;
import java.util.UUID;

import com.autarkos.pro.model.SignedEnvelopeV1;

public record ProEntitlementCache(
        UUID registrationId,
        SignedEnvelopeV1 durableGrantEnvelope,
        String durableGrantFingerprint,
        String durableGrantKeyId,
        Instant durableGrantIssuedAt,
        SignedEnvelopeV1 serviceLeaseEnvelope,
        String serviceLeaseFingerprint,
        String serviceLeaseKeyId,
        Instant serviceLeaseIssuedAt,
        Instant lastVerifiedServerTime,
        Instant lastRefreshAttemptAt,
        Instant lastRefreshSuccessAt,
        String lastFailureCategory,
        int consecutiveFailures,
        Instant nextRefreshAt,
        Instant deactivatedAt,
        Instant createdAt,
        Instant updatedAt) {

    public static ProEntitlementCache empty(Instant now) {
        return new ProEntitlementCache(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                0,
                null,
                null,
                now,
                now);
    }

    public ProEntitlementCache beginRefresh(UUID newRegistrationId, Instant now) {
        return new ProEntitlementCache(
                newRegistrationId == null ? registrationId : newRegistrationId,
                durableGrantEnvelope,
                durableGrantFingerprint,
                durableGrantKeyId,
                durableGrantIssuedAt,
                serviceLeaseEnvelope,
                serviceLeaseFingerprint,
                serviceLeaseKeyId,
                serviceLeaseIssuedAt,
                lastVerifiedServerTime,
                now,
                lastRefreshSuccessAt,
                lastFailureCategory,
                consecutiveFailures,
                nextRefreshAt,
                newRegistrationId == null ? deactivatedAt : null,
                createdAt,
                now);
    }

    public ProEntitlementCache associateRegistration(UUID newRegistrationId, Instant now) {
        if (newRegistrationId == null) {
            throw new IllegalArgumentException("Pro registration ID is required.");
        }
        return new ProEntitlementCache(
                newRegistrationId,
                durableGrantEnvelope,
                durableGrantFingerprint,
                durableGrantKeyId,
                durableGrantIssuedAt,
                serviceLeaseEnvelope,
                serviceLeaseFingerprint,
                serviceLeaseKeyId,
                serviceLeaseIssuedAt,
                lastVerifiedServerTime,
                lastRefreshAttemptAt,
                lastRefreshSuccessAt,
                lastFailureCategory,
                consecutiveFailures,
                nextRefreshAt,
                null,
                createdAt,
                now);
    }

    public ProEntitlementCache refreshSucceeded(
            UUID newRegistrationId,
            SignedEnvelopeV1 grantEnvelope,
            GrantVerifier.VerifiedGrant grant,
            SignedEnvelopeV1 leaseEnvelope,
            ServiceLeaseVerifier.VerifiedLease lease,
            Instant verifiedServerTime,
            Instant nextAttemptAt,
            Instant now) {
        return new ProEntitlementCache(
                newRegistrationId == null ? registrationId : newRegistrationId,
                grantEnvelope,
                grant.fingerprint(),
                grant.keyId(),
                grant.grant().issuedAt(),
                leaseEnvelope,
                lease.fingerprint(),
                lease.keyId(),
                lease.lease().issuedAt(),
                maximum(lastVerifiedServerTime, verifiedServerTime),
                now,
                now,
                null,
                0,
                nextAttemptAt,
                null,
                createdAt,
                now);
    }

    public ProEntitlementCache refreshFailed(
            String failureCategory,
            int failureCount,
            Instant nextAttemptAt,
            Instant now) {
        return new ProEntitlementCache(
                registrationId,
                durableGrantEnvelope,
                durableGrantFingerprint,
                durableGrantKeyId,
                durableGrantIssuedAt,
                serviceLeaseEnvelope,
                serviceLeaseFingerprint,
                serviceLeaseKeyId,
                serviceLeaseIssuedAt,
                lastVerifiedServerTime,
                now,
                lastRefreshSuccessAt,
                failureCategory,
                failureCount,
                nextAttemptAt,
                deactivatedAt,
                createdAt,
                now);
    }

    public ProEntitlementCache locallyDeactivated(Instant now) {
        return new ProEntitlementCache(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                lastVerifiedServerTime,
                lastRefreshAttemptAt,
                lastRefreshSuccessAt,
                null,
                0,
                null,
                now,
                createdAt,
                now);
    }

    public boolean hasAssociationOrDocuments() {
        return registrationId != null
                || durableGrantEnvelope != null
                || serviceLeaseEnvelope != null;
    }

    private static Instant maximum(Instant first, Instant second) {
        if (first == null) {
            return second;
        }
        if (second == null) {
            return first;
        }
        return first.isAfter(second) ? first : second;
    }
}
