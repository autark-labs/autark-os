package com.autarkos.pro.release;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditEventType;
import com.autarkos.pro.audit.ProAuditException;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.model.ProContractVerificationException;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.model.ProReleaseManifest;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.autarkos.pro.model.SignedEnvelopeVerifier;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

@Component
public class ReleaseManifestVerifier {

    public static final String DOCUMENT_TYPE = "autark-pro-release+jwt";
    private static final Pattern SEMVER = Pattern.compile(
            "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)"
                    + "(?:-([0-9A-Za-z.-]+))?(?:\\+[0-9A-Za-z.-]+)?$");
    private static final Pattern REPOSITORY = Pattern.compile(
            "^[a-z0-9.-]+(?::[0-9]+)?/[a-z0-9._/-]+$");

    private final ReleaseTrustStore trustStore;
    private final ReleaseStateRepository stateRepository;
    private final Set<String> repositoryAllowlist;
    private final ObjectMapper objectMapper;
    private final ProAuditService audit;

    public ReleaseManifestVerifier(
            ReleaseTrustStore trustStore,
            ReleaseStateRepository stateRepository,
            @Value("${autark.pro.release-repository-allowlist:"
                    + "registry.staging.autarklabs.com/autark-pro-agent}")
                    String repositories) {
        this(
                trustStore,
                stateRepository,
                repositories,
                null);
    }

    @Autowired
    public ReleaseManifestVerifier(
            ReleaseTrustStore trustStore,
            ReleaseStateRepository stateRepository,
            @Value("${autark.pro.release-repository-allowlist:"
                    + "registry.staging.autarklabs.com/autark-pro-agent}")
                    String repositories,
            ProAuditService audit) {
        this.trustStore = trustStore;
        this.stateRepository = stateRepository;
        this.repositoryAllowlist = parseAllowlist(repositories);
        this.audit = audit;
        this.objectMapper = new ObjectMapper(
                JsonFactory.builder()
                        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                        .build())
                .registerModule(new JavaTimeModule())
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public VerifiedRelease verifyForDownload(
            SignedEnvelopeV1 envelope,
            VerificationContext context) {
        requireContext(context);
        String envelopeFingerprint = safeFingerprint(envelope);
        String keyId = safeKeyId(envelope);
        ParsedRelease parsed = null;
        try {
            parsed = verifyEnvelope(envelope);
            auditRelease(
                    ProAuditEventType.SIGNATURE_VERIFIED,
                    "download-signature",
                    parsed,
                    keyId,
                    envelopeFingerprint,
                    "completed",
                    "verified");
            validatePolicy(parsed.manifest(), context, false);
            ReleaseStateRepository.AcceptanceResult result =
                    stateRepository.accept(
                            new ReleaseStateRepository.AcceptedRelease(
                                    parsed.manifest().component(),
                                    parsed.manifest().releaseChannel(),
                                    parsed.manifest().sequence(),
                                    parsed.fingerprint(),
                                    parsed.manifest().digest(),
                                    parsed.manifest().version(),
                                    context.trustedNow()));
            if (result
                    == ReleaseStateRepository.AcceptanceResult.LOWER_SEQUENCE) {
                throw failure(
                        "lower_sequence",
                        "Release manifest sequence is below the accepted sequence.");
            }
            if (result
                    == ReleaseStateRepository.AcceptanceResult.SEQUENCE_CONFLICT) {
                throw failure(
                        "sequence_conflict",
                        "Release manifest sequence conflicts with accepted authority.");
            }
            auditRelease(
                    ProAuditEventType.MANIFEST_ACCEPTED,
                    "download-manifest",
                    parsed,
                    keyId,
                    envelopeFingerprint,
                    "completed",
                    result.name().toLowerCase(
                            java.util.Locale.ROOT));
            return new VerifiedRelease(
                    parsed.manifest(),
                    parsed.fingerprint(),
                    result);
        } catch (RuntimeException exception) {
            if (exception instanceof ProAuditException) {
                throw exception;
            }
            auditRelease(
                    parsed == null
                            ? ProAuditEventType.SIGNATURE_REJECTED
                            : ProAuditEventType.MANIFEST_REJECTED,
                    parsed == null
                            ? "download-signature"
                            : "download-manifest",
                    parsed,
                    keyId,
                    envelopeFingerprint,
                    "failed",
                    failureCode(exception));
            throw exception;
        }
    }

    public VerifiedRelease verifyRetainedKnownGood(
            SignedEnvelopeV1 envelope,
            VerificationContext context) {
        requireContext(context);
        String envelopeFingerprint = safeFingerprint(envelope);
        String keyId = safeKeyId(envelope);
        ParsedRelease parsed = null;
        try {
            parsed = verifyEnvelope(envelope);
            auditRelease(
                    ProAuditEventType.SIGNATURE_VERIFIED,
                    "retained-signature",
                    parsed,
                    keyId,
                    envelopeFingerprint,
                    "completed",
                    "verified");
            validatePolicy(parsed.manifest(), context, true);
            if (!stateRepository.isKnownGood(
                    parsed.manifest().component(),
                    parsed.manifest().releaseChannel(),
                    parsed.manifest().digest(),
                    parsed.fingerprint())) {
                throw failure(
                        "rollback_not_authorized",
                        "Release is not a retained known-good rollback target.");
            }
            auditRelease(
                    ProAuditEventType.MANIFEST_ACCEPTED,
                    "retained-manifest",
                    parsed,
                    keyId,
                    envelopeFingerprint,
                    "completed",
                    "idempotent");
            return new VerifiedRelease(
                    parsed.manifest(),
                    parsed.fingerprint(),
                    ReleaseStateRepository.AcceptanceResult.IDEMPOTENT);
        } catch (RuntimeException exception) {
            if (exception instanceof ProAuditException) {
                throw exception;
            }
            auditRelease(
                    parsed == null
                            ? ProAuditEventType.SIGNATURE_REJECTED
                            : ProAuditEventType.MANIFEST_REJECTED,
                    parsed == null
                            ? "retained-signature"
                            : "retained-manifest",
                    parsed,
                    keyId,
                    envelopeFingerprint,
                    "failed",
                    failureCode(exception));
            throw exception;
        }
    }

    public void markKnownGood(VerifiedRelease release, Instant knownGoodAt) {
        if (release == null || knownGoodAt == null) {
            throw new IllegalArgumentException("Verified release and known-good time are required.");
        }
        stateRepository.markKnownGood(
                release.manifest().component(),
                release.manifest().releaseChannel(),
                release.manifest().digest(),
                release.fingerprint(),
                knownGoodAt);
    }

    private ParsedRelease verifyEnvelope(SignedEnvelopeV1 envelope) {
        SignedEnvelopeVerifier.ProtectedHeader header =
                SignedEnvelopeVerifier.inspect(envelope);
        String canonicalHeader = "{\"alg\":\"EdDSA\",\"kid\":"
                + jsonString(header.kid())
                + ",\"typ\":\""
                + DOCUMENT_TYPE
                + "\"}";
        String encodedHeader = Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(canonicalHeader.getBytes(StandardCharsets.UTF_8));
        if (!MessageDigest.isEqual(
                encodedHeader.getBytes(StandardCharsets.US_ASCII),
                envelope.protectedHeader().getBytes(StandardCharsets.US_ASCII))) {
            throw failure(
                    "noncanonical_release_header",
                    "Release manifest protected header is not canonical.");
        }
        var verified = SignedEnvelopeVerifier.verify(
                envelope,
                DOCUMENT_TYPE,
                header.kid(),
                trustStore.verificationKey(header.kid()));
        ProReleaseManifest manifest;
        try {
            JsonNode tree = objectMapper.readTree(verified.payload());
            String canonical = canonicalize(tree);
            if (!MessageDigest.isEqual(
                    canonical.getBytes(StandardCharsets.UTF_8),
                    verified.payload())) {
                throw failure(
                        "noncanonical_manifest",
                        "Release manifest payload is not canonical.");
            }
            manifest = objectMapper.treeToValue(tree, ProReleaseManifest.class);
        } catch (ProContractVerificationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("invalid_manifest", "Release manifest payload is invalid.");
        }
        if (!header.kid().equals(manifest.signingKeyId())) {
            throw failure("release_key_mismatch", "Release signing identity is invalid.");
        }
        return new ParsedRelease(manifest, fingerprint(envelope));
    }

    private void validatePolicy(
            ProReleaseManifest manifest,
            VerificationContext context,
            boolean retainedKnownGood) {
        validateContract(manifest);
        if (!manifest.releaseChannel().equals(context.releaseChannel())) {
            throw failure("release_channel_mismatch", "Release channel is not assigned to this appliance.");
        }
        if (!manifest.architecture().equals(context.architecture())) {
            throw failure("wrong_architecture", "Release architecture is incompatible with this appliance.");
        }
        if (!repositoryAllowlist.contains(manifest.repository())) {
            throw failure("unknown_repository", "Release repository is not trusted.");
        }
        if (context.expectedDigest() != null
                && !manifest.digest().equals(context.expectedDigest())) {
            throw failure("digest_mismatch", "Release digest does not match the assigned image.");
        }
        if (compareSemver(context.coreVersion(), manifest.minimumCoreVersion()) < 0
                || (manifest.maximumCoreVersion() != null
                        && compareSemver(
                                context.coreVersion(),
                                manifest.maximumCoreVersion()) > 0)) {
            throw failure("incompatible_core", "Release is incompatible with this core version.");
        }
        if (!manifest.agentApiRange().equals(context.agentApiMajor() + ".x")) {
            throw failure("incompatible_agent_api", "Release uses an unsupported agent API.");
        }
        ProEntitlementStatus entitlement = context.entitlement();
        if (manifest.publishedAt().isAfter(entitlement.updatesThrough())) {
            throw failure("post_maintenance", "Release was published outside the update term.");
        }
        if (!entitlement.features().containsAll(manifest.features())) {
            throw failure("feature_not_entitled", "Release requires unavailable Pro features.");
        }
        if (manifest.createdAt().isAfter(context.trustedNow().plusSeconds(300))) {
            throw failure("manifest_from_future", "Release manifest creation time is invalid.");
        }
        if (retainedKnownGood) {
            if (!entitlement.localUseAllowed()) {
                throw failure("local_use_unavailable", "Retained Pro use is not authorized.");
            }
            return;
        }
        if (!context.trustedNow().isBefore(manifest.expiresAt())) {
            throw failure("expired_manifest", "Release manifest has expired for new downloads.");
        }
        if (!entitlement.updatesAllowed()
                || entitlement.state() != ProEntitlementState.ACTIVE) {
            throw failure("updates_unavailable", "New Pro downloads are not authorized.");
        }
    }

    private static void validateContract(ProReleaseManifest manifest) {
        if (manifest == null
                || !"1".equals(manifest.schemaVersion())
                || manifest.sequence() < 1
                || manifest.createdAt() == null
                || manifest.expiresAt() == null
                || manifest.publishedAt() == null
                || manifest.expiresAt().isBefore(manifest.createdAt())
                || manifest.publishedAt().isAfter(manifest.createdAt())
                || !List.of("development", "staging", "beta", "stable")
                        .contains(manifest.releaseChannel())
                || !"autark-pro-agent".equals(manifest.component())
                || !validSemver(manifest.version())
                || manifest.repository() == null
                || manifest.repository().length() > 255
                || !REPOSITORY.matcher(manifest.repository()).matches()
                || manifest.repository().contains("@")
                || manifest.digest() == null
                || !manifest.digest().matches("^sha256:[a-f0-9]{64}$")
                || !List.of("linux/amd64", "linux/arm64")
                        .contains(manifest.architecture())
                || !validSemver(manifest.minimumCoreVersion())
                || (manifest.maximumCoreVersion() != null
                        && !validSemver(manifest.maximumCoreVersion()))
                || (manifest.maximumCoreVersion() != null
                        && compareSemver(
                                manifest.minimumCoreVersion(),
                                manifest.maximumCoreVersion()) > 0)
                || manifest.agentApiRange() == null
                || !manifest.agentApiRange().matches("^[0-9]+\\.x$")
                || manifest.rolloutGroup() == null
                || !manifest.rolloutGroup()
                        .matches("^[a-z0-9][a-z0-9._-]{0,63}$")
                || manifest.features() == null
                || manifest.features().isEmpty()
                || manifest.features().contains(null)
                || manifest.features().stream().anyMatch(value ->
                        !value.matches("^[a-z][a-z0-9.-]{1,127}$"))
                || new HashSet<>(manifest.features()).size()
                        != manifest.features().size()
                || manifest.signingKeyId() == null
                || !manifest.signingKeyId()
                        .matches("^[A-Za-z0-9._-]{1,128}$")) {
            throw failure("invalid_manifest", "Release manifest payload is invalid.");
        }
    }

    private static Set<String> parseAllowlist(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Autark Pro release repository allowlist is empty.");
        }
        Set<String> parsed = new HashSet<>();
        for (String candidate : value.split(",")) {
            String repository = candidate.trim();
            if (!REPOSITORY.matcher(repository).matches()
                    || repository.contains("@")
                    || !parsed.add(repository)) {
                throw new IllegalStateException("Autark Pro release repository allowlist is invalid.");
            }
        }
        return Set.copyOf(parsed);
    }

    private static void requireContext(VerificationContext context) {
        if (context == null
                || context.architecture() == null
                || context.coreVersion() == null
                || !validSemver(context.coreVersion())
                || context.agentApiMajor() < 1
                || context.releaseChannel() == null
                || context.entitlement() == null
                || context.entitlement().updatesThrough() == null
                || context.entitlement().features() == null
                || context.trustedNow() == null
                || (context.expectedDigest() != null
                        && !context.expectedDigest()
                                .matches("^sha256:[a-f0-9]{64}$"))) {
            throw new IllegalArgumentException("Release verification context is invalid.");
        }
    }

    private static boolean validSemver(String value) {
        return value != null
                && value.length() <= 128
                && SEMVER.matcher(value).matches();
    }

    private static int compareSemver(String left, String right) {
        Matcher a = SEMVER.matcher(left);
        Matcher b = SEMVER.matcher(right);
        if (!a.matches() || !b.matches()) {
            throw failure("invalid_manifest", "Release version is invalid.");
        }
        for (int group = 1; group <= 3; group++) {
            int result = compareNumeric(a.group(group), b.group(group));
            if (result != 0) {
                return result;
            }
        }
        return comparePrerelease(a.group(4), b.group(4));
    }

    private static int compareNumeric(String left, String right) {
        String normalizedLeft = left.replaceFirst("^0+(?!$)", "");
        String normalizedRight = right.replaceFirst("^0+(?!$)", "");
        int length = Integer.compare(normalizedLeft.length(), normalizedRight.length());
        return length != 0 ? length : normalizedLeft.compareTo(normalizedRight);
    }

    private static int comparePrerelease(String left, String right) {
        if (left == null && right == null) {
            return 0;
        }
        if (left == null) {
            return 1;
        }
        if (right == null) {
            return -1;
        }
        String[] a = left.split("\\.");
        String[] b = right.split("\\.");
        for (int index = 0; index < Math.min(a.length, b.length); index++) {
            if (a[index].equals(b[index])) {
                continue;
            }
            boolean aNumeric = a[index].matches("^[0-9]+$");
            boolean bNumeric = b[index].matches("^[0-9]+$");
            if (aNumeric && bNumeric) {
                return compareNumeric(a[index], b[index]);
            }
            if (aNumeric != bNumeric) {
                return aNumeric ? -1 : 1;
            }
            return a[index].compareTo(b[index]);
        }
        return Integer.compare(a.length, b.length);
    }

    private static String fingerprint(SignedEnvelopeV1 envelope) {
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
            throw failure("verification_error", "Release manifest could not be fingerprinted.");
        }
    }

    private void auditRelease(
            ProAuditEventType type,
            String suffix,
            ParsedRelease parsed,
            String keyId,
            String envelopeFingerprint,
            String outcome,
            String reasonCode) {
        if (audit == null) {
            return;
        }
        ProReleaseManifest manifest =
                parsed == null ? null : parsed.manifest();
        audit.recordRequired(new ProAuditEvent(
                "release-"
                        + envelopeFingerprint.substring(
                                "sha256:".length(),
                                31)
                        + "-"
                        + suffix,
                type,
                null,
                "release",
                manifest == null ? null : manifest.version(),
                manifest == null ? null : manifest.digest(),
                null,
                null,
                outcome,
                reasonCode,
                keyId,
                envelopeFingerprint));
    }

    private static String safeFingerprint(
            SignedEnvelopeV1 envelope) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((
                            String.valueOf(envelope == null
                                    ? null
                                    : envelope.protectedHeader())
                                    + "."
                                    + String.valueOf(envelope == null
                                            ? null
                                            : envelope.payload())
                                    + "."
                                    + String.valueOf(envelope == null
                                            ? null
                                            : envelope.signature()))
                            .getBytes(StandardCharsets.UTF_8));
            return "sha256:"
                    + HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw failure(
                    "verification_error",
                    "Release manifest audit identity could not be derived.");
        }
    }

    private static String safeKeyId(
            SignedEnvelopeV1 envelope) {
        try {
            String keyId =
                    SignedEnvelopeVerifier.inspect(envelope).kid();
            return keyId != null
                            && keyId.matches(
                                    "^[A-Za-z0-9._-]{1,128}$")
                    ? keyId
                    : null;
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static String failureCode(RuntimeException exception) {
        String code = exception instanceof
                        ProContractVerificationException verification
                ? verification.code()
                : "verification_error";
        return code != null
                        && code.matches(
                                "^[a-z][a-z0-9_]{0,63}$")
                ? code
                : "verification_error";
    }

    private String canonicalize(JsonNode node) {
        try {
            if (node.isObject()) {
                List<String> fields = new ArrayList<>();
                node.fieldNames().forEachRemaining(fields::add);
                fields.sort(Comparator.naturalOrder());
                List<String> entries = new ArrayList<>();
                for (String field : fields) {
                    entries.add(objectMapper.writeValueAsString(field)
                            + ":"
                            + canonicalize(node.get(field)));
                }
                return "{" + String.join(",", entries) + "}";
            }
            if (node.isArray()) {
                List<String> entries = new ArrayList<>();
                node.forEach(value -> entries.add(canonicalize(value)));
                return "[" + String.join(",", entries) + "]";
            }
            if (node.isNull() || node.isBoolean() || node.isIntegralNumber()
                    || node.isTextual()) {
                return objectMapper.writeValueAsString(node);
            }
            throw failure("invalid_manifest", "Release manifest payload is invalid.");
        } catch (ProContractVerificationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("invalid_manifest", "Release manifest payload is invalid.");
        }
    }

    private String jsonString(String value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw failure(
                    "invalid_protected_header",
                    "Release manifest protected header is invalid.");
        }
    }

    private static ProContractVerificationException failure(
            String code,
            String message) {
        return new ProContractVerificationException(code, message);
    }

    private record ParsedRelease(
            ProReleaseManifest manifest,
            String fingerprint) {
    }

    public record VerificationContext(
            String architecture,
            String coreVersion,
            int agentApiMajor,
            String releaseChannel,
            String expectedDigest,
            ProEntitlementStatus entitlement,
            Instant trustedNow) {
    }

    public record VerifiedRelease(
            ProReleaseManifest manifest,
            String fingerprint,
            ReleaseStateRepository.AcceptanceResult acceptance) {
    }
}
