package com.autarkos.pro.controlplane;

import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

import org.springframework.stereotype.Component;

import com.autarkos.pro.identity.DeviceChallengeSignature;
import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DeviceIdentityService;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class DeviceOperationProofFactory {

    static final String PROOF_TYPE = "autark-pro-device-operation+jws";
    private static final DateTimeFormatter MILLIS_INSTANT =
            new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter();

    private final DeviceIdentityService identityService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public DeviceOperationProofFactory(DeviceIdentityService identityService) {
        this.identityService = identityService;
    }

    public ProControlPlaneClient.DeviceProofRequest create(
            ProControlPlaneClient.ChallengePurpose purpose,
            ProControlPlaneClient.RegistrationChallenge challenge) {
        if (purpose == null || challenge == null) {
            throw new IllegalArgumentException("Challenge purpose and response are required.");
        }
        DeviceIdentity identity = identityService.current();
        var payload = new CanonicalOperationChallenge(
                identity.deviceId(),
                MILLIS_INSTANT.format(challenge.expiresAt().truncatedTo(ChronoUnit.MILLIS)),
                MILLIS_INSTANT.format(challenge.issuedAt().truncatedTo(ChronoUnit.MILLIS)),
                challenge.nonce(),
                purpose.wireValue(),
                "1");
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
            return new ProControlPlaneClient.DeviceProofRequest(
                    "1",
                    new SignedEnvelopeV1(
                            encodedPayload,
                            protectedHeader,
                            signature.signature()));
        } catch (ProControlPlaneException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ProControlPlaneException(
                    "proof_creation_failed",
                    "Device operation proof could not be created.",
                    exception);
        }
    }

    private static String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    @JsonPropertyOrder({
            "deviceId",
            "expiresAt",
            "issuedAt",
            "nonce",
            "purpose",
            "schemaVersion"
    })
    private record CanonicalOperationChallenge(
            String deviceId,
            String expiresAt,
            String issuedAt,
            String nonce,
            String purpose,
            String schemaVersion) {
    }

    @JsonPropertyOrder({"alg", "kid", "typ"})
    private record CanonicalProtectedHeader(
            String alg,
            String kid,
            String typ) {
    }
}
