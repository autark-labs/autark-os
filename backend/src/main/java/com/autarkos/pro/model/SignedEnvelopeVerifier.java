package com.autarkos.pro.model;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PublicKey;
import java.security.Signature;
import java.security.SignatureException;
import java.util.Base64;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

public final class SignedEnvelopeVerifier {

    private static final int MAX_PAYLOAD_BYTES = 256 * 1024;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper(
            JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build())
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    private SignedEnvelopeVerifier() {
    }

    public static VerifiedEnvelope verify(
            SignedEnvelopeV1 envelope,
            String expectedType,
            String expectedKeyId,
            PublicKey publicKey) {
        if (envelope == null || publicKey == null) {
            throw failure("invalid_envelope", "Signed document is missing required verification data.");
        }
        ProtectedHeader header = inspect(envelope);
        if (!"EdDSA".equals(header.alg())) {
            throw failure("unsupported_algorithm", "Signed document uses an unsupported algorithm.");
        }
        if (!expectedType.equals(header.typ())) {
            throw failure("unexpected_document_type", "Signed document has an unexpected type.");
        }
        if (!expectedKeyId.equals(header.kid())) {
            throw failure("unknown_key", "Signed document references an unknown verification key.");
        }

        byte[] signatureBytes = decode(envelope.signature(), "invalid_signature", 256);
        byte[] signingInput = (envelope.protectedHeader() + "." + envelope.payload())
                .getBytes(StandardCharsets.US_ASCII);
        try {
            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(publicKey);
            verifier.update(signingInput);
            if (!verifier.verify(signatureBytes)) {
                throw failure("invalid_signature", "Signed document verification failed.");
            }
        } catch (SignatureException exception) {
            throw failure("invalid_signature", "Signed document verification failed.");
        } catch (GeneralSecurityException exception) {
            throw failure("verification_error", "Signed document could not be verified.");
        }

        byte[] payload = decode(envelope.payload(), "invalid_payload", MAX_PAYLOAD_BYTES);
        return new VerifiedEnvelope(header.kid(), header.typ(), payload);
    }

    public static ProtectedHeader inspect(SignedEnvelopeV1 envelope) {
        if (envelope == null) {
            throw failure("invalid_envelope", "Signed document is missing required verification data.");
        }
        byte[] protectedBytes = decode(envelope.protectedHeader(), "invalid_protected_header", 4096);
        return protectedHeader(protectedBytes);
    }

    private static ProtectedHeader protectedHeader(byte[] encoded) {
        try {
            ProtectedHeader header = OBJECT_MAPPER.readValue(encoded, ProtectedHeader.class);
            if (header.alg() == null || header.kid() == null || header.typ() == null) {
                throw failure("invalid_protected_header", "Signed document header is incomplete.");
            }
            return header;
        } catch (ProContractVerificationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("invalid_protected_header", "Signed document header is invalid.");
        }
    }

    private static byte[] decode(String value, String code, int maximumBytes) {
        if (value == null || value.isBlank() || value.contains("=") || !value.matches("^[A-Za-z0-9_-]+$")) {
            throw failure(code, "Signed document contains invalid base64url data.");
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(value);
            if (decoded.length > maximumBytes) {
                throw failure(code, "Signed document exceeds the allowed size.");
            }
            if (!Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(decoded)
                    .equals(value)) {
                throw failure(code, "Signed document contains invalid base64url data.");
            }
            return decoded;
        } catch (IllegalArgumentException exception) {
            throw failure(code, "Signed document contains invalid base64url data.");
        }
    }

    private static ProContractVerificationException failure(String code, String message) {
        return new ProContractVerificationException(code, message);
    }

    public record ProtectedHeader(
            String alg,
            String kid,
            String typ) {
    }

    public record VerifiedEnvelope(
            String keyId,
            String type,
            byte[] payload) {

        @Override
        public byte[] payload() {
            return payload.clone();
        }
    }
}
