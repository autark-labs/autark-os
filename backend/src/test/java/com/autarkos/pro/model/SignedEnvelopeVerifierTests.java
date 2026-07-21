package com.autarkos.pro.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SignedEnvelopeVerifierTests {

    private static final String TYPE = "autark-pro-grant+jwt";
    private static final String KEY_ID = "test-entitlement-1";

    private KeyPair keyPair;

    @BeforeEach
    void createTestKey() throws Exception {
        keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
    }

    @Test
    void verifiesStandardJwsFlattenedSigningInput() throws Exception {
        byte[] payload = "{\"schemaVersion\":\"1\",\"localUse\":\"perpetual\"}"
                .getBytes(StandardCharsets.UTF_8);
        SignedEnvelopeV1 envelope = sign(payload, "EdDSA", KEY_ID, TYPE);

        SignedEnvelopeVerifier.VerifiedEnvelope verified = SignedEnvelopeVerifier.verify(
                envelope,
                TYPE,
                KEY_ID,
                keyPair.getPublic());

        assertThat(verified.payload()).isEqualTo(payload);
        assertThat(verified.keyId()).isEqualTo(KEY_ID);
        assertThat(verified.type()).isEqualTo(TYPE);
    }

    @Test
    void tamperedPayloadFailsWithNonSecretCode() throws Exception {
        SignedEnvelopeV1 original = sign("valid".getBytes(StandardCharsets.UTF_8), "EdDSA", KEY_ID, TYPE);
        SignedEnvelopeV1 tampered = new SignedEnvelopeV1(
                encode("tampered".getBytes(StandardCharsets.UTF_8)),
                original.protectedHeader(),
                original.signature());

        assertThatThrownBy(() -> SignedEnvelopeVerifier.verify(tampered, TYPE, KEY_ID, keyPair.getPublic()))
                .isInstanceOfSatisfying(ProContractVerificationException.class,
                        exception -> assertThat(exception.code()).isEqualTo("invalid_signature"))
                .hasMessageNotContaining(original.signature());
    }

    @Test
    void algorithmTypeAndKeyConfusionFailClosed() throws Exception {
        SignedEnvelopeV1 wrongAlgorithm = sign("payload".getBytes(StandardCharsets.UTF_8), "none", KEY_ID, TYPE);
        SignedEnvelopeV1 valid = sign("payload".getBytes(StandardCharsets.UTF_8), "EdDSA", KEY_ID, TYPE);

        assertFailure(wrongAlgorithm, TYPE, KEY_ID, "unsupported_algorithm");
        assertFailure(valid, "other-document+jwt", KEY_ID, "unexpected_document_type");
        assertFailure(valid, TYPE, "unknown-key", "unknown_key");
    }

    @Test
    void paddedOrOversizedSegmentsFailClosed() throws Exception {
        SignedEnvelopeV1 valid = sign("payload".getBytes(StandardCharsets.UTF_8), "EdDSA", KEY_ID, TYPE);
        SignedEnvelopeV1 padded = new SignedEnvelopeV1(
                valid.payload() + "=",
                valid.protectedHeader(),
                valid.signature());

        assertFailure(padded, TYPE, KEY_ID, "invalid_signature");
    }

    private void assertFailure(SignedEnvelopeV1 envelope, String type, String keyId, String code) {
        assertThatThrownBy(() -> SignedEnvelopeVerifier.verify(envelope, type, keyId, keyPair.getPublic()))
                .isInstanceOfSatisfying(ProContractVerificationException.class,
                        exception -> assertThat(exception.code()).isEqualTo(code));
    }

    private SignedEnvelopeV1 sign(byte[] payload, String algorithm, String keyId, String type) throws Exception {
        String header = """
                {"alg":"%s","kid":"%s","typ":"%s"}\
                """.formatted(algorithm, keyId, type);
        String protectedHeader = encode(header.getBytes(StandardCharsets.UTF_8));
        String encodedPayload = encode(payload);
        Signature signer = Signature.getInstance("Ed25519");
        signer.initSign(keyPair.getPrivate());
        signer.update((protectedHeader + "." + encodedPayload).getBytes(StandardCharsets.US_ASCII));
        return new SignedEnvelopeV1(encodedPayload, protectedHeader, encode(signer.sign()));
    }

    private String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }
}
