package com.autarkos.pro.entitlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.Signature;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DevicePublicKey;
import com.autarkos.pro.model.DurableProductGrant;
import com.autarkos.pro.model.OnlineServiceLease;
import com.autarkos.pro.model.ProContractPolicy;
import com.autarkos.pro.model.ProContractVerificationException;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

class EntitlementDocumentVerifierTests {

    private static final String KEY_ID = "test-entitlement-key";
    private static final String DEVICE_ID = "11111111-1111-4111-8111-111111111111";
    private static final String INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
    private static final String FINGERPRINT =
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final Instant ISSUED_AT = Instant.parse("2026-07-19T12:00:00Z");
    private static final Instant UPDATES_THROUGH = Instant.parse("2029-07-19T12:00:00Z");
    private static final ObjectMapper MAPPER =
            new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    void verifiesDeviceBoundGrantAndLeaseWithOfflineTrustMaterial() throws Exception {
        KeyPair keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        ProTrustStore trustStore = trustStore(KEY_ID, keyPair.getPublic());
        GrantVerifier grantVerifier = new GrantVerifier(trustStore);
        ServiceLeaseVerifier leaseVerifier = new ServiceLeaseVerifier(trustStore);
        DeviceIdentity identity = identity();
        SignedEnvelopeV1 signedGrant = sign(
                grant(DEVICE_ID),
                GrantVerifier.DOCUMENT_TYPE,
                KEY_ID,
                keyPair);

        GrantVerifier.VerifiedGrant verifiedGrant =
                grantVerifier.verify(signedGrant, identity);
        SignedEnvelopeV1 signedLease = sign(
                lease("active"),
                ServiceLeaseVerifier.DOCUMENT_TYPE,
                KEY_ID,
                keyPair);
        ServiceLeaseVerifier.VerifiedLease verifiedLease =
                leaseVerifier.verify(signedLease, identity, verifiedGrant.grant());

        assertThat(verifiedGrant.grant().localUse()).isEqualTo("perpetual");
        assertThat(verifiedGrant.grant().updatesThrough()).isEqualTo(UPDATES_THROUGH);
        assertThat(verifiedGrant.fingerprint()).matches("^sha256:[0-9a-f]{64}$");
        assertThat(verifiedLease.lease().expiresAt())
                .isEqualTo(ISSUED_AT.plus(Duration.ofHours(24)));
        assertThat(ProContractPolicy.evaluate(
                verifiedGrant.grant(),
                true,
                false,
                verifiedLease.lease(),
                true,
                DEVICE_ID,
                FINGERPRINT,
                ISSUED_AT,
                verifiedLease.lease().serverTime(),
                Duration.ofDays(14),
                verifiedGrant.fingerprint()).state())
                .isEqualTo(ProEntitlementState.ACTIVE);
    }

    @Test
    void rejectsTamperingUnknownKeysAndAnotherDevice() throws Exception {
        KeyPair keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        GrantVerifier verifier = new GrantVerifier(trustStore(KEY_ID, keyPair.getPublic()));
        SignedEnvelopeV1 valid = sign(
                grant(DEVICE_ID),
                GrantVerifier.DOCUMENT_TYPE,
                KEY_ID,
                keyPair);
        SignedEnvelopeV1 tampered = new SignedEnvelopeV1(
                valid.payload().startsWith("A")
                        ? "B" + valid.payload().substring(1)
                        : "A" + valid.payload().substring(1),
                valid.protectedHeader(),
                valid.signature());

        assertThatThrownBy(() -> verifier.verify(tampered, identity()))
                .isInstanceOf(ProContractVerificationException.class)
                .extracting(exception ->
                        ((ProContractVerificationException) exception).code())
                .isEqualTo("invalid_signature");

        SignedEnvelopeV1 anotherDevice = sign(
                grant("99999999-9999-4999-8999-999999999999"),
                GrantVerifier.DOCUMENT_TYPE,
                KEY_ID,
                keyPair);
        assertThatThrownBy(() -> verifier.verify(anotherDevice, identity()))
                .isInstanceOf(ProContractVerificationException.class)
                .extracting(exception ->
                        ((ProContractVerificationException) exception).code())
                .isEqualTo("device_mismatch");

        SignedEnvelopeV1 unknownKey = sign(
                grant(DEVICE_ID),
                GrantVerifier.DOCUMENT_TYPE,
                "unknown-entitlement-key",
                keyPair);
        assertThatThrownBy(() -> verifier.verify(unknownKey, identity()))
                .isInstanceOf(ProContractVerificationException.class)
                .extracting(exception ->
                        ((ProContractVerificationException) exception).code())
                .isEqualTo("unknown_key");
    }

    @Test
    void embeddedTrustStoreContainsOnlyRotatablePublicKeys() {
        ClasspathProTrustStore trustStore = new ClasspathProTrustStore();

        assertThat(trustStore.keyIds())
                .contains("staging-entitlement-2026-01");
        assertThat(trustStore.verificationKey("staging-entitlement-2026-01")
                .getAlgorithm()).isEqualTo("EdDSA");
    }

    private static ProTrustStore trustStore(String keyId, PublicKey publicKey) {
        return new ProTrustStore() {
            @Override
            public PublicKey verificationKey(String requestedKeyId) {
                if (!keyId.equals(requestedKeyId)) {
                    throw new ProContractVerificationException(
                            "unknown_key",
                            "Signed document references an unknown verification key.");
                }
                return publicKey;
            }

            @Override
            public Set<String> keyIds() {
                return Set.of(keyId);
            }
        };
    }

    private static SignedEnvelopeV1 sign(
            Object payload,
            String type,
            String keyId,
            KeyPair keyPair) throws Exception {
        String protectedHeader = encode(MAPPER.writeValueAsBytes(
                new ProtectedHeader("EdDSA", keyId, type)));
        String encodedPayload = encode(MAPPER.writeValueAsBytes(payload));
        Signature signer = Signature.getInstance("Ed25519");
        signer.initSign(keyPair.getPrivate());
        signer.update((protectedHeader + "." + encodedPayload)
                .getBytes(StandardCharsets.US_ASCII));
        return new SignedEnvelopeV1(
                encodedPayload,
                protectedHeader,
                encode(signer.sign()));
    }

    private static String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static DeviceIdentity identity() {
        return new DeviceIdentity(
                "1",
                DEVICE_ID,
                INSTALLATION_ID,
                "Ed25519",
                "device-test-identity-key",
                new DevicePublicKey(
                        "OKP",
                        "Ed25519",
                        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
                FINGERPRINT,
                ISSUED_AT,
                ISSUED_AT);
    }

    private static DurableProductGrant grant(String deviceId) {
        return new DurableProductGrant(
                "1",
                "33333333-3333-4333-8333-333333333333",
                deviceId,
                INSTALLATION_ID,
                FINGERPRINT,
                "pro_home",
                features(),
                "staging",
                "autark-pro-test",
                ISSUED_AT,
                UPDATES_THROUGH,
                "perpetual",
                KEY_ID);
    }

    private static OnlineServiceLease lease(String status) {
        return new OnlineServiceLease(
                "1",
                "44444444-4444-4444-8444-444444444444",
                "33333333-3333-4333-8333-333333333333",
                DEVICE_ID,
                FINGERPRINT,
                features(),
                List.of("release-check", "registry", "compatibility-feed"),
                status,
                "autark-pro-test",
                ISSUED_AT,
                ISSUED_AT.plus(Duration.ofHours(12)),
                ISSUED_AT.plus(Duration.ofHours(24)),
                ISSUED_AT,
                KEY_ID);
    }

    private static List<String> features() {
        return List.of(
                "autark-pro.extension");
    }

    private record ProtectedHeader(
            String alg,
            String kid,
            String typ) {
    }
}
