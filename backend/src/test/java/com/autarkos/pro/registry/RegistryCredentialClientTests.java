package com.autarkos.pro.registry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditEventType;
import com.autarkos.pro.audit.ProAuditException;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.controlplane.DeviceOperationProofFactory;
import com.autarkos.pro.controlplane.ProControlPlaneClient;
import com.autarkos.pro.identity.DeviceChallengeSignature;
import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.identity.DeviceIdentityService;
import com.autarkos.pro.identity.DevicePublicKey;
import com.autarkos.pro.model.DeviceRegistrationRequest;
import com.autarkos.pro.model.ProReleaseManifest;
import com.autarkos.pro.release.ReleaseManifestVerifier;
import com.autarkos.pro.release.ReleaseStateRepository;

class RegistryCredentialClientTests {

    private static final String DEVICE_ID =
            "11111111-1111-4111-8111-111111111111";
    private static final String REPOSITORY =
            "registry.staging.autarklabs.com/autark-pro-agent";
    private static final String DIGEST =
            "sha256:dddddddddddddddddddddddddddddddd"
                    + "dddddddddddddddddddddddddddddddd";
    private static final Instant NOW =
            Instant.parse("2026-07-19T12:00:00Z");

    @Test
    void requestsExactVerifiedReleaseAndErasesEverySecretBuffer() throws Exception {
        FakeControlPlane controlPlane = new FakeControlPlane();
        DeviceIdentityService identityService = identityService();
        RegistryCredentialClient client = new RegistryCredentialClient(
                controlPlane,
                identityService,
                new DeviceOperationProofFactory(identityService));

        RegistryCredential credential = client.issue(verifiedRelease());
        char[][] observed = new char[1][];
        String value = credential.useSecret(secret -> {
            observed[0] = secret;
            return new String(secret);
        });

        assertThat(value).isEqualTo("header.payload.signature");
        assertThat(controlPlane.challengePurpose)
                .isEqualTo(
                        ProControlPlaneClient.ChallengePurpose.REGISTRY_TOKEN);
        assertThat(controlPlane.request.component())
                .isEqualTo("autark-pro-agent");
        assertThat(controlPlane.request.repository()).isEqualTo(REPOSITORY);
        assertThat(controlPlane.request.digest()).isEqualTo(DIGEST);
        assertThat(controlPlane.responseSecret)
                .containsOnly('\0');
        assertThat(credential.toString())
                .contains("secret=<redacted>")
                .doesNotContain("header.payload.signature");

        credential.close();
        assertThat(observed[0]).containsOnly('\0');
        assertThatThrownBy(() -> credential.useSecret(secret -> null))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void callbackFailureStillErasesCredential() {
        FakeControlPlane controlPlane = new FakeControlPlane();
        DeviceIdentityService identityService = identityService();
        RegistryCredentialClient client = new RegistryCredentialClient(
                controlPlane,
                identityService,
                new DeviceOperationProofFactory(identityService));
        char[][] observed = new char[1][];

        assertThatThrownBy(() ->
                client.withCredential(verifiedRelease(), credential -> {
                    credential.useSecret(secret -> {
                        observed[0] = secret;
                        return null;
                    });
                    throw new IllegalStateException("pull failed");
                }))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("pull failed");
        assertThat(observed[0]).containsOnly('\0');
    }

    @Test
    void credentialLifecycleAuditNeverReceivesRegistrySecret() {
        FakeControlPlane controlPlane = new FakeControlPlane();
        DeviceIdentityService identityService = identityService();
        ProAuditService audit = mock(ProAuditService.class);
        List<ProAuditEvent> events = new ArrayList<>();
        doAnswer(invocation -> {
            events.add(invocation.getArgument(0));
            return null;
        }).when(audit).recordRequired(any(ProAuditEvent.class));
        RegistryCredentialClient client = new RegistryCredentialClient(
                controlPlane,
                identityService,
                new DeviceOperationProofFactory(identityService),
                audit);

        try (RegistryCredential ignored =
                client.issue(verifiedRelease())) {
            assertThat(events)
                    .extracting(ProAuditEvent::type)
                    .containsExactly(
                            ProAuditEventType.REGISTRY_TOKEN_REQUESTED,
                            ProAuditEventType.REGISTRY_TOKEN_ISSUED);
            assertThat(events)
                    .allSatisfy(event -> {
                        assertThat(event.digest())
                                .isEqualTo(DIGEST);
                        assertThat(event.toString())
                                .doesNotContain(
                                        "header.payload.signature",
                                        "autark-pro-token",
                                        "bearer");
                    });
        }
    }

    @Test
    void requiredAuditFailureStopsBeforeCredentialIssuance() {
        FakeControlPlane controlPlane = new FakeControlPlane();
        DeviceIdentityService identityService = identityService();
        ProAuditService audit = mock(ProAuditService.class);
        doThrow(new ProAuditException(
                        new IllegalStateException("audit unavailable")))
                .when(audit)
                .recordRequired(any(ProAuditEvent.class));
        RegistryCredentialClient client = new RegistryCredentialClient(
                controlPlane,
                identityService,
                new DeviceOperationProofFactory(identityService),
                audit);

        assertThatThrownBy(() ->
                client.issue(verifiedRelease()))
                .isInstanceOf(ProAuditException.class);
        assertThat(controlPlane.request).isNull();
        assertThat(controlPlane.responseSecret).isNull();
    }

    private static ReleaseManifestVerifier.VerifiedRelease verifiedRelease() {
        return new ReleaseManifestVerifier.VerifiedRelease(
                new ProReleaseManifest(
                        "1",
                        1,
                        NOW.minusSeconds(60),
                        NOW.plusSeconds(300),
                        "staging",
                        "autark-pro-agent",
                        "1.2.3",
                        REPOSITORY,
                        DIGEST,
                        "linux/amd64",
                        NOW.minusSeconds(120),
                        "1.0.0",
                        null,
                        "1.x",
                        "prototype",
                        List.of("autark-pro.extension"),
                        "test-release-key"),
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ReleaseStateRepository.AcceptanceResult.ACCEPTED);
    }

    private static DeviceIdentityService identityService() {
        DeviceIdentity identity = new DeviceIdentity(
                "1",
                DEVICE_ID,
                "22222222-2222-4222-8222-222222222222",
                "Ed25519",
                "device-test-key",
                new DevicePublicKey(
                        "OKP",
                        "Ed25519",
                        Base64.getUrlEncoder().withoutPadding()
                                .encodeToString(new byte[32])),
                "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                        + "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                NOW.minusSeconds(3600),
                NOW.minusSeconds(3600));
        return new DeviceIdentityService() {
            @Override
            public DeviceIdentity current() {
                return identity;
            }

            @Override
            public DeviceChallengeSignature signChallenge(byte[] challenge) {
                return new DeviceChallengeSignature(
                        "Ed25519",
                        identity.keyId(),
                        Base64.getUrlEncoder().withoutPadding()
                                .encodeToString(new byte[64]));
            }

            @Override
            public DeviceIdentity rotateInstallationIdentity(
                    String confirmation) {
                throw new UnsupportedOperationException();
            }
        };
    }

    private static final class FakeControlPlane
            implements ProControlPlaneClient {

        private ChallengePurpose challengePurpose;
        private RegistryCredentialRequest request;
        private char[] responseSecret;

        @Override
        public RegistrationChallenge createDeviceChallenge(
                ChallengePurpose purpose,
                String deviceId,
                UUID requestId) {
            challengePurpose = purpose;
            return new RegistrationChallenge(
                    "1",
                    Base64.getUrlEncoder().withoutPadding()
                            .encodeToString(new byte[32]),
                    NOW,
                    NOW.plusSeconds(300),
                    requestId);
        }

        @Override
        public RegistryCredentialResponse issueRegistryCredential(
                RegistryCredentialRequest credentialRequest,
                UUID requestId) {
            request = credentialRequest;
            responseSecret = "header.payload.signature".toCharArray();
            return new RegistryCredentialResponse(
                    "1",
                    UUID.fromString(
                            "33333333-3333-4333-8333-333333333333"),
                    "bearer",
                    "autark-pro-token",
                    responseSecret,
                    REPOSITORY,
                    DIGEST,
                    NOW.plusSeconds(300),
                    NOW,
                    requestId);
        }

        @Override
        public ActivationTicket startActivation(
                String activationCode,
                UUID requestId) {
            throw unsupported();
        }

        @Override
        public RegistrationChallenge createRegistrationChallenge(
                String activationTicket,
                String deviceId,
                UUID requestId) {
            throw unsupported();
        }

        @Override
        public RegistrationResult registerDevice(
                DeviceRegistrationRequest registrationRequest,
                UUID requestId) {
            throw unsupported();
        }

        @Override
        public EntitlementDocuments renewEntitlements(
                DeviceProofRequest proofRequest,
                UUID requestId) {
            throw unsupported();
        }

        @Override
        public ReleaseCheckResult checkRelease(
                DeviceProofRequest proofRequest,
                UUID requestId) {
            throw unsupported();
        }

        private static UnsupportedOperationException unsupported() {
            return new UnsupportedOperationException();
        }
    }
}
