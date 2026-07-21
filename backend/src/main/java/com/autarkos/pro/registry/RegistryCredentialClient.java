package com.autarkos.pro.registry;

import java.time.Duration;
import java.util.Arrays;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditEventType;
import com.autarkos.pro.audit.ProAuditException;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.controlplane.DeviceOperationProofFactory;
import com.autarkos.pro.controlplane.ProControlPlaneClient;
import com.autarkos.pro.controlplane.ProControlPlaneException;
import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DeviceIdentityService;
import com.autarkos.pro.release.ReleaseManifestVerifier;

@Service
public class RegistryCredentialClient {

    private static final Duration MINIMUM_LIFETIME = Duration.ofSeconds(60);
    private static final Duration MAXIMUM_LIFETIME = Duration.ofMinutes(10);
    private static final int MAXIMUM_SECRET_CHARACTERS = 16 * 1024;
    private static final Pattern USERNAME =
            Pattern.compile("^[A-Za-z0-9._-]{1,128}$");
    private static final Pattern NATIVE_BEARER =
            Pattern.compile("^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$");

    private final ProControlPlaneClient controlPlaneClient;
    private final DeviceIdentityService identityService;
    private final DeviceOperationProofFactory proofFactory;
    private final ProAuditService audit;

    public RegistryCredentialClient(
            ProControlPlaneClient controlPlaneClient,
            DeviceIdentityService identityService,
            DeviceOperationProofFactory proofFactory) {
        this(
                controlPlaneClient,
                identityService,
                proofFactory,
                null);
    }

    @Autowired
    public RegistryCredentialClient(
            ProControlPlaneClient controlPlaneClient,
            DeviceIdentityService identityService,
            DeviceOperationProofFactory proofFactory,
            ProAuditService audit) {
        this.controlPlaneClient = Objects.requireNonNull(controlPlaneClient);
        this.identityService = Objects.requireNonNull(identityService);
        this.proofFactory = Objects.requireNonNull(proofFactory);
        this.audit = audit;
    }

    public RegistryCredential issue(
            ReleaseManifestVerifier.VerifiedRelease verifiedRelease) {
        if (verifiedRelease == null || verifiedRelease.manifest() == null) {
            throw invalidCredential();
        }
        var manifest = verifiedRelease.manifest();
        if (!"autark-pro-agent".equals(manifest.component())
                || manifest.repository() == null
                || manifest.digest() == null) {
            throw invalidCredential();
        }

        DeviceIdentity identity = identityService.current();
        UUID challengeRequestId = UUID.randomUUID();
        var challenge = controlPlaneClient.createDeviceChallenge(
                ProControlPlaneClient.ChallengePurpose.REGISTRY_TOKEN,
                identity.deviceId(),
                challengeRequestId);
        var proof = proofFactory.create(
                ProControlPlaneClient.ChallengePurpose.REGISTRY_TOKEN,
                challenge);
        UUID credentialRequestId = UUID.randomUUID();
        audit(
                verifiedRelease,
                credentialRequestId,
                ProAuditEventType.REGISTRY_TOKEN_REQUESTED,
                "started",
                "requested");
        try {
            var response =
                    controlPlaneClient.issueRegistryCredential(
                            new ProControlPlaneClient.RegistryCredentialRequest(
                                    "1",
                                    proof.challengeProof(),
                                    manifest.component(),
                                    manifest.repository(),
                                    manifest.digest()),
                            credentialRequestId);
            char[] responseSecret =
                    response == null ? null : response.secret();
            try {
                validate(
                        response,
                        credentialRequestId,
                        manifest.repository(),
                        manifest.digest());
                audit(
                        verifiedRelease,
                        credentialRequestId,
                        ProAuditEventType.REGISTRY_TOKEN_ISSUED,
                        "completed",
                        "issued");
                return new RegistryCredential(
                        response.credentialId(),
                        response.username(),
                        responseSecret,
                        response.repository(),
                        response.digest(),
                        response.expiresAt());
            } finally {
                if (responseSecret != null) {
                    Arrays.fill(responseSecret, '\0');
                }
            }
        } catch (RuntimeException exception) {
            if (exception instanceof ProAuditException) {
                throw exception;
            }
            audit(
                    verifiedRelease,
                    credentialRequestId,
                    ProAuditEventType.REGISTRY_TOKEN_FAILED,
                    "failed",
                    exception instanceof
                                    ProControlPlaneException controlPlane
                            ? controlPlane.code()
                            : "registry_credential_failed");
            throw exception;
        }
    }

    public <T, E extends Exception> T withCredential(
            ReleaseManifestVerifier.VerifiedRelease verifiedRelease,
            CredentialOperation<T, E> operation) throws E {
        Objects.requireNonNull(operation);
        try (RegistryCredential credential = issue(verifiedRelease)) {
            return operation.apply(credential);
        }
    }

    private static void validate(
            ProControlPlaneClient.RegistryCredentialResponse response,
            UUID expectedRequestId,
            String expectedRepository,
            String expectedDigest) {
        if (response == null
                || response.credentialId() == null
                || !"bearer".equals(response.credentialType())
                || response.username() == null
                || !USERNAME.matcher(response.username()).matches()
                || response.secret() == null
                || response.secret().length < 1
                || response.secret().length > MAXIMUM_SECRET_CHARACTERS
                || !NATIVE_BEARER.matcher(
                        java.nio.CharBuffer.wrap(response.secret())).matches()
                || !expectedRepository.equals(response.repository())
                || !expectedDigest.equals(response.digest())
                || response.expiresAt() == null
                || response.serverTime() == null
                || !expectedRequestId.equals(response.requestId())) {
            throw invalidCredential();
        }
        Duration lifetime =
                Duration.between(response.serverTime(), response.expiresAt());
        if (lifetime.compareTo(MINIMUM_LIFETIME) < 0
                || lifetime.compareTo(MAXIMUM_LIFETIME) > 0) {
            throw invalidCredential();
        }
    }

    private static ProControlPlaneException invalidCredential() {
        return new ProControlPlaneException(
                "invalid_registry_credential",
                "Control plane returned an invalid registry credential.");
    }

    private void audit(
            ReleaseManifestVerifier.VerifiedRelease release,
            UUID requestId,
            ProAuditEventType type,
            String outcome,
            String reasonCode) {
        if (audit == null) {
            return;
        }
        audit.recordRequired(new ProAuditEvent(
                "registry-"
                        + requestId
                        + "-"
                        + type.wireValue().replace(
                                "registry_token_",
                                ""),
                type,
                requestId.toString(),
                "registry",
                release.manifest().version(),
                release.manifest().digest(),
                null,
                null,
                outcome,
                safeReason(reasonCode),
                null,
                release.fingerprint()));
    }

    private static String safeReason(String value) {
        return value != null
                        && value.matches(
                                "^[a-z][a-z0-9_]{0,63}$")
                ? value
                : "registry_credential_failed";
    }

    @FunctionalInterface
    public interface CredentialOperation<T, E extends Exception> {

        T apply(RegistryCredential credential) throws E;
    }
}
