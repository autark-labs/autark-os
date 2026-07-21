package com.autarkos.pro.controlplane;

import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

import org.springframework.stereotype.Component;

import com.autarkos.pro.identity.DeviceChallengeSignature;
import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DeviceIdentityService;
import com.autarkos.pro.model.DeviceRegistrationRequest;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class DeviceRegistrationProofFactory {

    static final String PROOF_TYPE = "autark-pro-device-challenge+jws";
    private static final DateTimeFormatter MILLIS_INSTANT =
            new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter();

    private final DeviceIdentityService identityService;
    private final ObjectMapper objectMapper;

    public DeviceRegistrationProofFactory(DeviceIdentityService identityService) {
        this.identityService = identityService;
        this.objectMapper = new ObjectMapper();
    }

    public DeviceRegistrationRequest create(
            String idempotencyKey,
            String activationTicket,
            ProControlPlaneClient.RegistrationChallenge challenge,
            String architecture,
            String coreVersion) {
        DeviceIdentity identity = identityService.current();
        var payload = new CanonicalChallenge(
                "1",
                challenge.nonce(),
                identity.deviceId(),
                identity.installationId(),
                identity.publicKeyFingerprint(),
                normalizeArchitecture(architecture),
                requireCoreVersion(coreVersion),
                MILLIS_INSTANT.format(challenge.issuedAt().truncatedTo(ChronoUnit.MILLIS)),
                MILLIS_INSTANT.format(challenge.expiresAt().truncatedTo(ChronoUnit.MILLIS)));
        var header = new CanonicalProtectedHeader("EdDSA", identity.keyId(), PROOF_TYPE);

        try {
            String protectedHeader = encode(objectMapper.writeValueAsBytes(header));
            String encodedPayload = encode(objectMapper.writeValueAsBytes(payload));
            byte[] signingInput = (protectedHeader + "." + encodedPayload)
                    .getBytes(StandardCharsets.US_ASCII);
            DeviceChallengeSignature signature = identityService.signChallenge(signingInput);
            if (!"Ed25519".equals(signature.algorithm())
                    || !identity.keyId().equals(signature.keyId())) {
                throw new ProControlPlaneException(
                        "identity_key_mismatch",
                        "Device identity returned an unexpected signing key.");
            }
            return new DeviceRegistrationRequest(
                    "1",
                    idempotencyKey,
                    activationTicket,
                    new DeviceRegistrationRequest.Ed25519PublicJwk(
                            identity.publicKey().crv(),
                            identity.publicKey().kty(),
                            identity.publicKey().x()),
                    new SignedEnvelopeV1(
                            encodedPayload,
                            protectedHeader,
                            signature.signature()));
        } catch (ProControlPlaneException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ProControlPlaneException(
                    "proof_creation_failed",
                    "Device registration proof could not be created.",
                    exception);
        }
    }

    private static String normalizeArchitecture(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase();
        return switch (normalized) {
            case "linux/amd64", "amd64", "x86_64" -> "linux/amd64";
            case "linux/arm64", "arm64", "aarch64" -> "linux/arm64";
            default -> throw new IllegalArgumentException("Unsupported Pro architecture.");
        };
    }

    private static String requireCoreVersion(String value) {
        if (value == null
                || value.length() > 128
                || !value.matches(
                        "^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$")) {
            throw new IllegalArgumentException("Invalid Autark OS core version.");
        }
        return value;
    }

    private static String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    @JsonPropertyOrder({
            "architecture",
            "coreVersion",
            "deviceId",
            "expiresAt",
            "installationId",
            "issuedAt",
            "nonce",
            "publicKeyFingerprint",
            "schemaVersion"
    })
    private record CanonicalChallenge(
            String schemaVersion,
            String nonce,
            String deviceId,
            String installationId,
            String publicKeyFingerprint,
            String architecture,
            String coreVersion,
            String issuedAt,
            String expiresAt) {
    }

    @JsonPropertyOrder({"alg", "kid", "typ"})
    private record CanonicalProtectedHeader(
            String alg,
            String kid,
            String typ) {
    }
}
