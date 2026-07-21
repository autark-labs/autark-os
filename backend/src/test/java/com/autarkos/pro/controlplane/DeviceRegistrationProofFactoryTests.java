package com.autarkos.pro.controlplane;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.autarkos.pro.identity.DeviceChallengeSignature;
import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DeviceIdentityService;
import com.autarkos.pro.identity.DevicePublicKey;
import com.autarkos.pro.model.DeviceRegistrationRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

class DeviceRegistrationProofFactoryTests {

    private static final byte[] ED25519_SPKI_PREFIX =
            HexFormat.of().parseHex("302a300506032b6570032100");
    private static final String DEVICE_ID = "11111111-1111-4111-8111-111111111111";
    private static final String INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";

    @Test
    void createsCanonicalDeviceBoundEd25519Jws() throws Exception {
        KeyPair keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        DeviceIdentity identity = identity(keyPair);
        DeviceIdentityService identityService = signingService(identity, keyPair);
        DeviceRegistrationProofFactory factory =
                new DeviceRegistrationProofFactory(identityService);
        var challenge = new ProControlPlaneClient.RegistrationChallenge(
                "1",
                Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]),
                Instant.parse("2026-07-19T12:00:00Z"),
                Instant.parse("2026-07-19T12:05:00Z"),
                UUID.fromString("33333333-3333-4333-8333-333333333333"));

        DeviceRegistrationRequest request = factory.create(
                "44444444-4444-4444-8444-444444444444",
                "test_activation_ticket_that_is_long_enough",
                challenge,
                "x86_64",
                "1.2.3");

        assertThat(request.schemaVersion()).isEqualTo("1");
        assertThat(request.publicKey().x()).isEqualTo(identity.publicKey().x());
        JsonNode header = decode(request.challengeProof().protectedHeader());
        JsonNode payload = decode(request.challengeProof().payload());
        assertThat(header.path("alg").asText()).isEqualTo("EdDSA");
        assertThat(header.path("kid").asText()).isEqualTo(identity.keyId());
        assertThat(header.path("typ").asText())
                .isEqualTo(DeviceRegistrationProofFactory.PROOF_TYPE);
        assertThat(payload.path("deviceId").asText()).isEqualTo(DEVICE_ID);
        assertThat(payload.path("installationId").asText()).isEqualTo(INSTALLATION_ID);
        assertThat(payload.path("architecture").asText()).isEqualTo("linux/amd64");
        assertThat(payload.path("issuedAt").asText()).isEqualTo("2026-07-19T12:00:00.000Z");
        assertThat(payload.path("expiresAt").asText()).isEqualTo("2026-07-19T12:05:00.000Z");

        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(KeyFactory.getInstance("Ed25519").generatePublic(
                new X509EncodedKeySpec(keyPair.getPublic().getEncoded())));
        verifier.update((
                request.challengeProof().protectedHeader()
                        + "."
                        + request.challengeProof().payload())
                .getBytes(StandardCharsets.US_ASCII));
        assertThat(verifier.verify(Base64.getUrlDecoder().decode(
                request.challengeProof().signature()))).isTrue();
    }

    @Test
    void createsCanonicalPurposeBoundOperationProof() throws Exception {
        KeyPair keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        DeviceIdentity identity = identity(keyPair);
        DeviceOperationProofFactory factory =
                new DeviceOperationProofFactory(signingService(identity, keyPair));
        var challenge = new ProControlPlaneClient.RegistrationChallenge(
                "1",
                Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]),
                Instant.parse("2026-07-19T12:00:00Z"),
                Instant.parse("2026-07-19T12:05:00Z"),
                UUID.fromString("33333333-3333-4333-8333-333333333333"));

        var request = factory.create(
                ProControlPlaneClient.ChallengePurpose.ENTITLEMENT_RENEW,
                challenge);

        JsonNode header = decode(request.challengeProof().protectedHeader());
        JsonNode payload = decode(request.challengeProof().payload());
        assertThat(header.path("typ").asText())
                .isEqualTo(DeviceOperationProofFactory.PROOF_TYPE);
        assertThat(payload.path("purpose").asText()).isEqualTo("entitlement_renew");
        assertThat(payload.path("deviceId").asText()).isEqualTo(DEVICE_ID);
        assertThat(payload.path("issuedAt").asText()).isEqualTo("2026-07-19T12:00:00.000Z");

        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(keyPair.getPublic());
        verifier.update((
                request.challengeProof().protectedHeader()
                        + "."
                        + request.challengeProof().payload())
                .getBytes(StandardCharsets.US_ASCII));
        assertThat(verifier.verify(Base64.getUrlDecoder().decode(
                request.challengeProof().signature()))).isTrue();
    }

    private static DeviceIdentity identity(KeyPair keyPair) throws Exception {
        byte[] encoded = keyPair.getPublic().getEncoded();
        assertThat(Arrays.copyOf(encoded, ED25519_SPKI_PREFIX.length))
                .isEqualTo(ED25519_SPKI_PREFIX);
        String x = Base64.getUrlEncoder().withoutPadding().encodeToString(
                Arrays.copyOfRange(encoded, ED25519_SPKI_PREFIX.length, encoded.length));
        String fingerprint = "sha256:" + HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(encoded));
        return new DeviceIdentity(
                "1",
                DEVICE_ID,
                INSTALLATION_ID,
                "Ed25519",
                "device-" + fingerprint.substring(7, 31),
                new DevicePublicKey("OKP", "Ed25519", x),
                fingerprint,
                Instant.parse("2026-07-19T11:00:00Z"),
                Instant.parse("2026-07-19T11:00:00Z"));
    }

    private static DeviceIdentityService signingService(
            DeviceIdentity identity,
            KeyPair keyPair) {
        return new DeviceIdentityService() {
            @Override
            public DeviceIdentity current() {
                return identity;
            }

            @Override
            public DeviceChallengeSignature signChallenge(byte[] challenge) {
                try {
                    Signature signer = Signature.getInstance("Ed25519");
                    signer.initSign(keyPair.getPrivate());
                    signer.update(challenge);
                    return new DeviceChallengeSignature(
                            "Ed25519",
                            identity.keyId(),
                            Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign()));
                } catch (Exception exception) {
                    throw new IllegalStateException(exception);
                }
            }

            @Override
            public DeviceIdentity rotateInstallationIdentity(String confirmation) {
                throw new UnsupportedOperationException();
            }
        };
    }

    private static JsonNode decode(String value) throws Exception {
        return new ObjectMapper().readTree(Base64.getUrlDecoder().decode(value));
    }
}
