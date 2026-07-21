package com.autarkos.pro.release;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.Signature;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditEventType;
import com.autarkos.pro.audit.ProAuditException;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.model.ProContractVerificationException;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.autarkos.pro.release.ReleaseManifestVerifier.VerificationContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

class ReleaseManifestVerifierTests {

    private static final Instant NOW = Instant.parse("2026-07-19T12:00:00Z");
    private static final String KEY_ID = "test-release-key";
    private static final String REPOSITORY =
            "registry.staging.autarklabs.com/autark-pro-agent";
    private static final String DIGEST =
            "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

    private final ObjectMapper mapper = new ObjectMapper();
    private KeyPair keyPair;
    private InMemoryState state;
    private ReleaseManifestVerifier verifier;

    @BeforeEach
    void setUp() throws Exception {
        keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        state = new InMemoryState();
        verifier = new ReleaseManifestVerifier(
                trustStore(keyPair.getPublic()),
                state,
                REPOSITORY);
    }

    @Test
    void acceptsAuthenticCompatibleReleaseAndAdvancesSequenceOnlyAfterPolicy() {
        var verified = verifier.verifyForDownload(signed(payload()), context());

        assertThat(verified.manifest().sequence()).isEqualTo(7);
        assertThat(verified.manifest().digest()).isEqualTo(DIGEST);
        assertThat(state.highestAcceptedSequence("autark-pro-agent", "staging"))
                .hasValue(7);

        Map<String, Object> wrongArchitecture = payload();
        wrongArchitecture.put("sequence", 8);
        wrongArchitecture.put("architecture", "linux/arm64");
        assertCode(
                () -> verifier.verifyForDownload(
                        signed(wrongArchitecture),
                        context()),
                "wrong_architecture");
        assertThat(state.highestAcceptedSequence("autark-pro-agent", "staging"))
                .hasValue(7);

        Map<String, Object> lower = payload();
        lower.put("sequence", 6);
        assertCode(
                () -> verifier.verifyForDownload(signed(lower), context()),
                "lower_sequence");
    }

    @Test
    void rejectsEachReleaseSecurityBoundaryWithStableRedactedCode() {
        SignedEnvelopeV1 valid = signed(payload());
        SignedEnvelopeV1 tampered = new SignedEnvelopeV1(
                valid.payload(),
                valid.protectedHeader(),
                (valid.signature().startsWith("A") ? "B" : "A")
                        + valid.signature().substring(1));
        assertCode(
                () -> verifier.verifyForDownload(tampered, context()),
                "invalid_signature");

        Map<String, Object> expired = payload();
        expired.put("createdAt", "2026-07-19T11:00:00Z");
        expired.put("publishedAt", "2026-07-19T10:30:00Z");
        expired.put("expiresAt", "2026-07-19T11:59:59Z");
        assertCode(
                () -> verifier.verifyForDownload(signed(expired), context()),
                "expired_manifest");

        assertCode(
                () -> verifier.verifyForDownload(
                        valid,
                        context("0.0.9", "linux/amd64", DIGEST, entitlement())),
                "incompatible_core");
        assertCode(
                () -> verifier.verifyForDownload(
                        valid,
                        context("1.0.0", "linux/arm64", DIGEST, entitlement())),
                "wrong_architecture");

        Map<String, Object> unknownRepository = payload();
        unknownRepository.put(
                "repository",
                "registry.untrusted.example/autark-pro-agent");
        assertCode(
                () -> verifier.verifyForDownload(
                        signed(unknownRepository),
                        context()),
                "unknown_repository");

        assertCode(
                () -> verifier.verifyForDownload(
                        valid,
                        context(
                                "1.0.0",
                                "linux/amd64",
                                "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                                entitlement())),
                "digest_mismatch");

        ProEntitlementStatus termEnded = entitlement(
                Instant.parse("2026-07-19T11:00:00Z"),
                true,
                true);
        assertCode(
                () -> verifier.verifyForDownload(
                        valid,
                        context("1.0.0", "linux/amd64", DIGEST, termEnded)),
                "post_maintenance");
    }

    @Test
    void recordsSafeSignatureAndManifestEvidenceForAcceptanceAndRejection() {
        ProAuditService audit = mock(ProAuditService.class);
        List<ProAuditEvent> events = new ArrayList<>();
        doAnswer(invocation -> {
            events.add(invocation.getArgument(0));
            return null;
        }).when(audit).recordRequired(any(ProAuditEvent.class));
        ReleaseManifestVerifier audited =
                new ReleaseManifestVerifier(
                        trustStore(keyPair.getPublic()),
                        new InMemoryState(),
                        REPOSITORY,
                        audit);
        SignedEnvelopeV1 accepted = signed(payload());

        audited.verifyForDownload(accepted, context());
        SignedEnvelopeV1 rejected = new SignedEnvelopeV1(
                accepted.payload(),
                accepted.protectedHeader(),
                (accepted.signature().startsWith("A") ? "B" : "A")
                        + accepted.signature().substring(1));
        assertCode(
                () -> audited.verifyForDownload(
                        rejected,
                        context()),
                "invalid_signature");

        assertThat(events)
                .extracting(ProAuditEvent::type)
                .containsExactly(
                        ProAuditEventType.SIGNATURE_VERIFIED,
                        ProAuditEventType.MANIFEST_ACCEPTED,
                        ProAuditEventType.SIGNATURE_REJECTED);
        ProAuditEvent failure = events.get(2);
        assertThat(failure.keyId()).isEqualTo(KEY_ID);
        assertThat(failure.fingerprint())
                .matches("^sha256:[0-9a-f]{64}$");
        assertThat(failure.reasonCode())
                .isEqualTo("invalid_signature");
        assertThat(failure.digest()).isNull();
        assertThat(failure.componentVersion()).isNull();
        assertThat(failure.toString())
                .doesNotContain(
                        accepted.payload(),
                        accepted.protectedHeader(),
                        accepted.signature());
    }

    @Test
    void requiredAuditFailurePreventsReleaseAuthorityAdvance() {
        ProAuditService audit = mock(ProAuditService.class);
        doThrow(new ProAuditException(
                        new IllegalStateException("audit unavailable")))
                .when(audit)
                .recordRequired(any(ProAuditEvent.class));
        InMemoryState isolatedState = new InMemoryState();
        ReleaseManifestVerifier audited =
                new ReleaseManifestVerifier(
                        trustStore(keyPair.getPublic()),
                        isolatedState,
                        REPOSITORY,
                        audit);

        assertThatThrownBy(() ->
                audited.verifyForDownload(
                        signed(payload()),
                        context()))
                .isInstanceOf(ProAuditException.class);
        assertThat(isolatedState.highestAcceptedSequence(
                        "autark-pro-agent",
                        "staging"))
                .isEmpty();
    }

    @Test
    void allowsExpiredImageOnlyWhenItWasMarkedKnownGood() {
        SignedEnvelopeV1 envelope = signed(payload());
        var accepted = verifier.verifyForDownload(envelope, context());
        verifier.markKnownGood(accepted, NOW.plusSeconds(30));
        VerificationContext later = new VerificationContext(
                "linux/amd64",
                "1.0.0",
                1,
                "staging",
                DIGEST,
                entitlement(
                        Instant.parse("2026-07-19T13:00:00Z"),
                        true,
                        false),
                Instant.parse("2026-08-01T12:00:00Z"));

        assertThat(verifier.verifyRetainedKnownGood(envelope, later)
                .manifest().digest()).isEqualTo(DIGEST);

        Map<String, Object> other = payload();
        other.put("sequence", 8);
        other.put(
                "digest",
                "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
        VerificationContext otherContext = new VerificationContext(
                later.architecture(),
                later.coreVersion(),
                later.agentApiMajor(),
                later.releaseChannel(),
                null,
                later.entitlement(),
                later.trustedNow());
        assertCode(
                () -> verifier.verifyRetainedKnownGood(
                        signed(other),
                        otherContext),
                "rollback_not_authorized");
    }

    @Test
    void releaseTrustStoreIsASeparateKeyRole() {
        ClasspathReleaseTrustStore releaseKeys = new ClasspathReleaseTrustStore();

        assertThat(releaseKeys.keyIds())
                .containsExactly("staging-release-2026-01");
        assertThat(releaseKeys.keyIds())
                .doesNotContain("staging-entitlement-2026-01");
    }

    private VerificationContext context() {
        return context("1.0.0", "linux/amd64", DIGEST, entitlement());
    }

    private VerificationContext context(
            String coreVersion,
            String architecture,
            String digest,
            ProEntitlementStatus entitlement) {
        return new VerificationContext(
                architecture,
                coreVersion,
                1,
                "staging",
                digest,
                entitlement,
                NOW);
    }

    private ProEntitlementStatus entitlement() {
        return entitlement(
                Instant.parse("2029-07-19T12:00:00Z"),
                true,
                true);
    }

    private ProEntitlementStatus entitlement(
            Instant updatesThrough,
            boolean localUse,
            boolean updatesAllowed) {
        return new ProEntitlementStatus(
                "1",
                updatesAllowed
                        ? ProEntitlementState.ACTIVE
                        : ProEntitlementState.RETAINED_USE,
                "pro_home",
                List.of("autark-pro.extension"),
                updatesThrough,
                NOW.plusSeconds(3600),
                NOW,
                localUse,
                updatesAllowed,
                updatesAllowed,
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "none");
    }

    private Map<String, Object> payload() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("schemaVersion", "1");
        payload.put("sequence", 7);
        payload.put("createdAt", "2026-07-19T12:00:00Z");
        payload.put("expiresAt", "2026-07-26T12:00:00Z");
        payload.put("releaseChannel", "staging");
        payload.put("component", "autark-pro-agent");
        payload.put("version", "0.1.0");
        payload.put("repository", REPOSITORY);
        payload.put("digest", DIGEST);
        payload.put("architecture", "linux/amd64");
        payload.put("publishedAt", "2026-07-19T11:30:00Z");
        payload.put("minimumCoreVersion", "0.1.0");
        payload.put("maximumCoreVersion", null);
        payload.put("agentApiRange", "1.x");
        payload.put("rolloutGroup", "prototype");
        payload.put("features", List.of("autark-pro.extension"));
        payload.put("signingKeyId", KEY_ID);
        return payload;
    }

    private SignedEnvelopeV1 signed(Map<String, Object> payload) {
        try {
            String header = canonical(Map.of(
                    "alg", "EdDSA",
                    "kid", KEY_ID,
                    "typ", ReleaseManifestVerifier.DOCUMENT_TYPE));
            String body = canonical(payload);
            String protectedHeader = base64Url(header);
            String encodedPayload = base64Url(body);
            Signature signature = Signature.getInstance("Ed25519");
            signature.initSign(keyPair.getPrivate());
            signature.update(
                    (protectedHeader + "." + encodedPayload)
                            .getBytes(StandardCharsets.US_ASCII));
            return new SignedEnvelopeV1(
                    encodedPayload,
                    protectedHeader,
                    Base64.getUrlEncoder()
                            .withoutPadding()
                            .encodeToString(signature.sign()));
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private String canonical(Object value) throws Exception {
        return canonical(mapper.valueToTree(value));
    }

    private String canonical(JsonNode node) throws Exception {
        if (node.isObject()) {
            List<String> fields = new ArrayList<>();
            node.fieldNames().forEachRemaining(fields::add);
            fields.sort(Comparator.naturalOrder());
            List<String> entries = new ArrayList<>();
            for (String field : fields) {
                entries.add(mapper.writeValueAsString(field)
                        + ":"
                        + canonical(node.get(field)));
            }
            return "{" + String.join(",", entries) + "}";
        }
        if (node.isArray()) {
            List<String> entries = new ArrayList<>();
            node.forEach(item -> {
                try {
                    entries.add(canonical(item));
                } catch (Exception exception) {
                    throw new IllegalStateException(exception);
                }
            });
            return "[" + String.join(",", entries) + "]";
        }
        return mapper.writeValueAsString(node);
    }

    private static String base64Url(String value) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static ReleaseTrustStore trustStore(PublicKey publicKey) {
        return new ReleaseTrustStore() {
            @Override
            public PublicKey verificationKey(String keyId) {
                if (!KEY_ID.equals(keyId)) {
                    throw new ProContractVerificationException(
                            "unknown_release_key",
                            "Unknown release key.");
                }
                return publicKey;
            }

            @Override
            public Set<String> keyIds() {
                return Set.of(KEY_ID);
            }
        };
    }

    private static void assertCode(Runnable operation, String code) {
        assertThatThrownBy(operation::run)
                .isInstanceOf(ProContractVerificationException.class)
                .extracting(error ->
                        ((ProContractVerificationException) error).code())
                .isEqualTo(code);
    }

    private static final class InMemoryState implements ReleaseStateRepository {

        private final Map<String, AcceptedRelease> highest = new HashMap<>();
        private final Map<String, AcceptedRelease> accepted = new HashMap<>();
        private final Set<String> knownGood = new java.util.HashSet<>();

        @Override
        public AcceptanceResult accept(AcceptedRelease release) {
            String key = release.component() + ":" + release.releaseChannel();
            AcceptedRelease current = highest.get(key);
            if (current != null && release.sequence() < current.sequence()) {
                return AcceptanceResult.LOWER_SEQUENCE;
            }
            if (current != null && release.sequence() == current.sequence()) {
                return current.manifestFingerprint()
                                .equals(release.manifestFingerprint())
                        && current.digest().equals(release.digest())
                        ? AcceptanceResult.IDEMPOTENT
                        : AcceptanceResult.SEQUENCE_CONFLICT;
            }
            highest.put(key, release);
            accepted.put(release.manifestFingerprint(), release);
            return AcceptanceResult.ACCEPTED;
        }

        @Override
        public void markKnownGood(
                String component,
                String releaseChannel,
                String digest,
                String manifestFingerprint,
                Instant knownGoodAt) {
            AcceptedRelease release = accepted.get(manifestFingerprint);
            if (release == null || !release.digest().equals(digest)) {
                throw new ProContractVerificationException(
                        "unknown_release",
                        "Unknown release.");
            }
            knownGood.add(manifestFingerprint + ":" + digest);
        }

        @Override
        public boolean isKnownGood(
                String component,
                String releaseChannel,
                String digest,
                String manifestFingerprint) {
            return knownGood.contains(manifestFingerprint + ":" + digest);
        }

        @Override
        public OptionalLong highestAcceptedSequence(
                String component,
                String releaseChannel) {
            AcceptedRelease release = highest.get(component + ":" + releaseChannel);
            return release == null
                    ? OptionalLong.empty()
                    : OptionalLong.of(release.sequence());
        }
    }
}
