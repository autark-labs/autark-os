package com.autarkos.pro.entitlement;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.model.DurableProductGrant;
import com.autarkos.pro.model.OnlineServiceLease;
import com.autarkos.pro.model.ProContractVerificationException;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.autarkos.pro.model.SignedEnvelopeVerifier;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

@Component
public class ServiceLeaseVerifier {

    public static final String DOCUMENT_TYPE = "autark-pro-lease+jwt";
    private static final Set<String> KNOWN_SERVICES = Set.of(
            "release-check",
            "registry",
            "compatibility-feed",
            "hosted-relay",
            "push",
            "support-coordination");

    private final ProTrustStore trustStore;
    private final ObjectMapper objectMapper;

    public ServiceLeaseVerifier(ProTrustStore trustStore) {
        this.trustStore = trustStore;
        this.objectMapper = new ObjectMapper(
                JsonFactory.builder()
                        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                        .build())
                .registerModule(new JavaTimeModule())
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public VerifiedLease verify(
            SignedEnvelopeV1 envelope,
            DeviceIdentity identity,
            DurableProductGrant grant) {
        if (identity == null || grant == null) {
            throw failure("grant_mismatch", "Online service lease is missing its device grant.");
        }
        SignedEnvelopeVerifier.ProtectedHeader header =
                SignedEnvelopeVerifier.inspect(envelope);
        var verified = SignedEnvelopeVerifier.verify(
                envelope,
                DOCUMENT_TYPE,
                header.kid(),
                trustStore.verificationKey(header.kid()));
        OnlineServiceLease lease = payload(verified.payload());
        validate(lease, header.kid(), identity, grant);
        return new VerifiedLease(
                lease,
                GrantVerifier.fingerprint(envelope),
                header.kid());
    }

    private OnlineServiceLease payload(byte[] payload) {
        try {
            return objectMapper.readValue(payload, OnlineServiceLease.class);
        } catch (Exception exception) {
            throw failure("invalid_lease", "Online service lease payload is invalid.");
        }
    }

    private static void validate(
            OnlineServiceLease lease,
            String headerKeyId,
            DeviceIdentity identity,
            DurableProductGrant grant) {
        if (!"1".equals(lease.schemaVersion())) {
            throw failure("unknown_schema", "Online service lease schema is unsupported.");
        }
        if (!headerKeyId.equals(lease.keyId())) {
            throw failure("key_mismatch", "Online service lease key binding is invalid.");
        }
        if (!identity.deviceId().equals(lease.deviceId())
                || !identity.publicKeyFingerprint().equals(
                        lease.devicePublicKeyFingerprint())) {
            throw failure("device_mismatch", "Online service lease belongs to another device.");
        }
        if (!grant.grantId().equals(lease.grantId())
                || !grant.features().containsAll(lease.features())) {
            throw failure("grant_mismatch", "Online service lease does not match its durable grant.");
        }
        if (!validRandomUuid(lease.leaseId())
                || lease.issuer() == null
                || lease.issuer().isBlank()
                || lease.issuer().length() > 128
                || lease.keyId() == null
                || !lease.keyId().matches("^[A-Za-z0-9._-]{1,128}$")
                || lease.devicePublicKeyFingerprint() == null
                || !lease.devicePublicKeyFingerprint()
                        .matches("^sha256:[0-9a-f]{64}$")
                || lease.issuedAt() == null
                || lease.renewAfter() == null
                || lease.expiresAt() == null
                || lease.serverTime() == null
                || lease.renewAfter().isBefore(lease.issuedAt())
                || !lease.expiresAt().isAfter(lease.renewAfter())
                || lease.serverTime().isBefore(lease.issuedAt())
                || !List.of("active", "suspended", "revoked").contains(lease.status())
                || !knownUniqueFeatures(lease.features())
                || !knownUniqueServices(lease.services())) {
            throw failure("invalid_lease", "Online service lease payload is invalid.");
        }
    }

    private static boolean validRandomUuid(String value) {
        try {
            UUID parsed = UUID.fromString(value);
            return parsed.version() == 4
                    && parsed.toString().equals(value);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private static boolean knownUniqueFeatures(List<String> features) {
        return features != null
                && !features.isEmpty()
                && !features.contains(null)
                && features.stream().allMatch(value ->
                        value.matches("^[a-z][a-z0-9.-]{1,127}$"))
                && new HashSet<>(features).size() == features.size();
    }

    private static boolean knownUniqueServices(List<String> services) {
        return services != null
                && !services.isEmpty()
                && KNOWN_SERVICES.containsAll(services)
                && new HashSet<>(services).size() == services.size();
    }

    private static ProContractVerificationException failure(
            String code,
            String message) {
        return new ProContractVerificationException(code, message);
    }

    public record VerifiedLease(
            OnlineServiceLease lease,
            String fingerprint,
            String keyId) {
    }
}
