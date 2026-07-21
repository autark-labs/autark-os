package com.autarkos.pro.entitlement;

import java.time.Instant;
import java.util.UUID;

import com.autarkos.pro.model.SignedEnvelopeV1;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "pro_entitlement_cache")
class ProEntitlementEntity {

    static final int SINGLETON_ID = 1;

    @Id
    @Column(name = "cache_id")
    private Integer cacheId;

    @Column(name = "schema_version", nullable = false)
    private String schemaVersion;

    @Column(name = "registration_id")
    private String registrationId;

    @Column(name = "durable_grant_payload")
    private String durableGrantPayload;

    @Column(name = "durable_grant_protected")
    private String durableGrantProtected;

    @Column(name = "durable_grant_signature")
    private String durableGrantSignature;

    @Column(name = "durable_grant_fingerprint")
    private String durableGrantFingerprint;

    @Column(name = "durable_grant_key_id")
    private String durableGrantKeyId;

    @Column(name = "durable_grant_issued_at")
    private String durableGrantIssuedAt;

    @Column(name = "service_lease_payload")
    private String serviceLeasePayload;

    @Column(name = "service_lease_protected")
    private String serviceLeaseProtected;

    @Column(name = "service_lease_signature")
    private String serviceLeaseSignature;

    @Column(name = "service_lease_fingerprint")
    private String serviceLeaseFingerprint;

    @Column(name = "service_lease_key_id")
    private String serviceLeaseKeyId;

    @Column(name = "service_lease_issued_at")
    private String serviceLeaseIssuedAt;

    @Column(name = "last_verified_server_time")
    private String lastVerifiedServerTime;

    @Column(name = "last_refresh_attempt_at")
    private String lastRefreshAttemptAt;

    @Column(name = "last_refresh_success_at")
    private String lastRefreshSuccessAt;

    @Column(name = "last_failure_category")
    private String lastFailureCategory;

    @Column(name = "consecutive_failures", nullable = false)
    private int consecutiveFailures;

    @Column(name = "next_refresh_at")
    private String nextRefreshAt;

    @Column(name = "deactivated_at")
    private String deactivatedAt;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    @Column(name = "updated_at", nullable = false)
    private String updatedAt;

    protected ProEntitlementEntity() {
    }

    ProEntitlementEntity(ProEntitlementCache cache) {
        this.cacheId = SINGLETON_ID;
        this.schemaVersion = "1";
        update(cache);
    }

    void update(ProEntitlementCache cache) {
        this.registrationId = value(cache.registrationId());
        this.durableGrantPayload = payload(cache.durableGrantEnvelope());
        this.durableGrantProtected = protectedHeader(cache.durableGrantEnvelope());
        this.durableGrantSignature = signature(cache.durableGrantEnvelope());
        this.durableGrantFingerprint = cache.durableGrantFingerprint();
        this.durableGrantKeyId = cache.durableGrantKeyId();
        this.durableGrantIssuedAt = value(cache.durableGrantIssuedAt());
        this.serviceLeasePayload = payload(cache.serviceLeaseEnvelope());
        this.serviceLeaseProtected = protectedHeader(cache.serviceLeaseEnvelope());
        this.serviceLeaseSignature = signature(cache.serviceLeaseEnvelope());
        this.serviceLeaseFingerprint = cache.serviceLeaseFingerprint();
        this.serviceLeaseKeyId = cache.serviceLeaseKeyId();
        this.serviceLeaseIssuedAt = value(cache.serviceLeaseIssuedAt());
        this.lastVerifiedServerTime = value(cache.lastVerifiedServerTime());
        this.lastRefreshAttemptAt = value(cache.lastRefreshAttemptAt());
        this.lastRefreshSuccessAt = value(cache.lastRefreshSuccessAt());
        this.lastFailureCategory = cache.lastFailureCategory();
        this.consecutiveFailures = cache.consecutiveFailures();
        this.nextRefreshAt = value(cache.nextRefreshAt());
        this.deactivatedAt = value(cache.deactivatedAt());
        this.createdAt = value(cache.createdAt());
        this.updatedAt = value(cache.updatedAt());
    }

    ProEntitlementCache cache() {
        if (!"1".equals(schemaVersion)) {
            throw new IllegalStateException("Cached Pro entitlement schema is unsupported.");
        }
        return new ProEntitlementCache(
                uuid(registrationId),
                envelope(durableGrantPayload, durableGrantProtected, durableGrantSignature),
                durableGrantFingerprint,
                durableGrantKeyId,
                instant(durableGrantIssuedAt),
                envelope(serviceLeasePayload, serviceLeaseProtected, serviceLeaseSignature),
                serviceLeaseFingerprint,
                serviceLeaseKeyId,
                instant(serviceLeaseIssuedAt),
                instant(lastVerifiedServerTime),
                instant(lastRefreshAttemptAt),
                instant(lastRefreshSuccessAt),
                lastFailureCategory,
                consecutiveFailures,
                instant(nextRefreshAt),
                instant(deactivatedAt),
                instant(createdAt),
                instant(updatedAt));
    }

    private static SignedEnvelopeV1 envelope(
            String payload,
            String protectedHeader,
            String signature) {
        return payload == null ? null : new SignedEnvelopeV1(payload, protectedHeader, signature);
    }

    private static String payload(SignedEnvelopeV1 envelope) {
        return envelope == null ? null : envelope.payload();
    }

    private static String protectedHeader(SignedEnvelopeV1 envelope) {
        return envelope == null ? null : envelope.protectedHeader();
    }

    private static String signature(SignedEnvelopeV1 envelope) {
        return envelope == null ? null : envelope.signature();
    }

    private static String value(Object value) {
        return value == null ? null : value.toString();
    }

    private static Instant instant(String value) {
        return value == null ? null : Instant.parse(value);
    }

    private static UUID uuid(String value) {
        return value == null ? null : UUID.fromString(value);
    }
}
