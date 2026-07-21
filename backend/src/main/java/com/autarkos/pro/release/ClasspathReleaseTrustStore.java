package com.autarkos.pro.release;

import java.io.InputStream;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.autarkos.pro.model.ProContractVerificationException;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class ClasspathReleaseTrustStore implements ReleaseTrustStore {

    static final String RESOURCE = "/pro/release-trust-store-v1.json";
    private static final byte[] ED25519_SPKI_PREFIX =
            HexFormat.of().parseHex("302a300506032b6570032100");

    private final Map<String, PublicKey> keys;

    public ClasspathReleaseTrustStore() {
        this(RESOURCE);
    }

    ClasspathReleaseTrustStore(String resource) {
        this.keys = load(resource);
    }

    @Override
    public PublicKey verificationKey(String keyId) {
        PublicKey key = keys.get(keyId);
        if (key == null) {
            throw failure("unknown_release_key");
        }
        return key;
    }

    @Override
    public Set<String> keyIds() {
        return keys.keySet();
    }

    private static Map<String, PublicKey> load(String resource) {
        ObjectMapper mapper = new ObjectMapper(
                JsonFactory.builder()
                        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                        .build())
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        try (InputStream input =
                ClasspathReleaseTrustStore.class.getResourceAsStream(resource)) {
            if (input == null) {
                throw failure("missing_release_trust_store");
            }
            TrustDocument document = mapper.readValue(input, TrustDocument.class);
            if (!"1".equals(document.schemaVersion())
                    || document.keys() == null
                    || document.keys().isEmpty()) {
                throw failure("invalid_release_trust_store");
            }
            Map<String, PublicKey> decoded = new LinkedHashMap<>();
            for (TrustKey key : document.keys()) {
                validate(key);
                if (decoded.putIfAbsent(
                        key.keyId(),
                        publicKey(key.publicKey().x())) != null) {
                    throw failure("duplicate_release_trust_key");
                }
            }
            return Collections.unmodifiableMap(decoded);
        } catch (ProContractVerificationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("invalid_release_trust_store");
        }
    }

    private static void validate(TrustKey key) {
        if (key == null
                || key.keyId() == null
                || !key.keyId().matches("^[A-Za-z0-9._-]{1,128}$")
                || !"Ed25519".equals(key.algorithm())
                || key.publicKey() == null
                || !"OKP".equals(key.publicKey().kty())
                || !"Ed25519".equals(key.publicKey().crv())
                || key.publicKey().x() == null
                || !key.publicKey().x().matches("^[A-Za-z0-9_-]{43}$")) {
            throw failure("invalid_release_trust_key");
        }
    }

    private static PublicKey publicKey(String x) {
        try {
            byte[] raw = Base64.getUrlDecoder().decode(x);
            if (raw.length != 32
                    || !Base64.getUrlEncoder()
                            .withoutPadding()
                            .encodeToString(raw)
                            .equals(x)) {
                throw failure("invalid_release_trust_key");
            }
            byte[] encoded = Arrays.copyOf(
                    ED25519_SPKI_PREFIX,
                    ED25519_SPKI_PREFIX.length + raw.length);
            System.arraycopy(raw, 0, encoded, ED25519_SPKI_PREFIX.length, raw.length);
            return KeyFactory.getInstance("Ed25519")
                    .generatePublic(new X509EncodedKeySpec(encoded));
        } catch (ProContractVerificationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("invalid_release_trust_key");
        }
    }

    private static ProContractVerificationException failure(String code) {
        return new ProContractVerificationException(
                code,
                "Autark Pro release trust material is invalid.");
    }

    private record TrustDocument(String schemaVersion, List<TrustKey> keys) {
    }

    private record TrustKey(
            String keyId,
            String algorithm,
            PublicJwk publicKey) {
    }

    private record PublicJwk(String kty, String crv, String x) {
    }
}
