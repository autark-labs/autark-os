package com.autarkos.pro.entitlement;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.model.DurableProductGrant;
import com.autarkos.pro.model.ProContractVerificationException;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.autarkos.pro.model.SignedEnvelopeVerifier;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

@Component
public class GrantVerifier {

    public static final String DOCUMENT_TYPE = "autark-pro-grant+jwt";

    private final ProTrustStore trustStore;
    private final ObjectMapper objectMapper;

    public GrantVerifier(ProTrustStore trustStore) {
        this.trustStore = trustStore;
        this.objectMapper = new ObjectMapper(
                JsonFactory.builder()
                        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                        .build())
                .registerModule(new JavaTimeModule())
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public VerifiedGrant verify(SignedEnvelopeV1 envelope, DeviceIdentity identity) {
        if (identity == null) {
            throw failure("device_mismatch", "Device identity is unavailable.");
        }
        SignedEnvelopeVerifier.ProtectedHeader header =
                SignedEnvelopeVerifier.inspect(envelope);
        var verified = SignedEnvelopeVerifier.verify(
                envelope,
                DOCUMENT_TYPE,
                header.kid(),
                trustStore.verificationKey(header.kid()));
        DurableProductGrant grant = payload(verified.payload());
        validate(grant, header.kid(), identity);
        return new VerifiedGrant(
                grant,
                fingerprint(envelope),
                header.kid());
    }

    private DurableProductGrant payload(byte[] payload) {
        try {
            return objectMapper.readValue(payload, DurableProductGrant.class);
        } catch (Exception exception) {
            throw failure("invalid_grant", "Durable product grant payload is invalid.");
        }
    }

    private static void validate(
            DurableProductGrant grant,
            String headerKeyId,
            DeviceIdentity identity) {
        if (!"1".equals(grant.schemaVersion())) {
            throw failure("unknown_schema", "Durable product grant schema is unsupported.");
        }
        if (!headerKeyId.equals(grant.keyId())) {
            throw failure("key_mismatch", "Durable product grant key binding is invalid.");
        }
        if (!identity.deviceId().equals(grant.deviceId())
                || !identity.installationId().equals(grant.installationId())
                || !identity.publicKeyFingerprint().equals(
                        grant.devicePublicKeyFingerprint())) {
            throw failure("device_mismatch", "Durable product grant belongs to another device.");
        }
        if (!validRandomUuid(grant.grantId())
                || grant.plan() == null
                || !grant.plan().matches("^[a-z][a-z0-9_-]{0,63}$")
                || grant.issuer() == null
                || grant.issuer().isBlank()
                || grant.issuer().length() > 128
                || grant.keyId() == null
                || !grant.keyId().matches("^[A-Za-z0-9._-]{1,128}$")
                || grant.devicePublicKeyFingerprint() == null
                || !grant.devicePublicKeyFingerprint()
                        .matches("^sha256:[0-9a-f]{64}$")
                || grant.issuedAt() == null
                || grant.updatesThrough() == null
                || grant.updatesThrough().isBefore(grant.issuedAt())
                || !"perpetual".equals(grant.localUse())
                || !List.of("development", "staging", "beta", "stable")
                        .contains(grant.releaseChannel())
                || !knownUniqueFeatures(grant.features())) {
            throw failure("invalid_grant", "Durable product grant payload is invalid.");
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

    static String fingerprint(SignedEnvelopeV1 envelope) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest((
                    envelope.protectedHeader()
                            + "."
                            + envelope.payload()
                            + "."
                            + envelope.signature())
                    .getBytes(StandardCharsets.US_ASCII));
            return "sha256:" + HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw failure("verification_error", "Signed document could not be fingerprinted.");
        }
    }

    private static ProContractVerificationException failure(
            String code,
            String message) {
        return new ProContractVerificationException(code, message);
    }

    public record VerifiedGrant(
            DurableProductGrant grant,
            String fingerprint,
            String keyId) {
    }
}
