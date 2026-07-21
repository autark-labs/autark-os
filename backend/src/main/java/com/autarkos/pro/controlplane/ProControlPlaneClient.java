package com.autarkos.pro.controlplane;

import java.time.Instant;
import java.util.UUID;

import com.autarkos.pro.model.DeviceRegistrationRequest;
import com.autarkos.pro.model.SignedEnvelopeV1;

public interface ProControlPlaneClient {

    ActivationTicket startActivation(String activationCode, UUID requestId);

    RegistrationChallenge createRegistrationChallenge(
            String activationTicket,
            String deviceId,
            UUID requestId);

    RegistrationChallenge createDeviceChallenge(
            ChallengePurpose purpose,
            String deviceId,
            UUID requestId);

    RegistrationResult registerDevice(
            DeviceRegistrationRequest request,
            UUID requestId);

    EntitlementDocuments renewEntitlements(
            DeviceProofRequest request,
            UUID requestId);

    ReleaseCheckResult checkRelease(
            DeviceProofRequest request,
            UUID requestId);

    RegistryCredentialResponse issueRegistryCredential(
            RegistryCredentialRequest request,
            UUID requestId);

    enum ChallengePurpose {
        ENTITLEMENT_RENEW("entitlement_renew"),
        RELEASE_CHECK("release_check"),
        REGISTRY_TOKEN("registry_token");

        private final String wireValue;

        ChallengePurpose(String wireValue) {
            this.wireValue = wireValue;
        }

        public String wireValue() {
            return wireValue;
        }
    }

    record ActivationTicket(
            String schemaVersion,
            String activationTicket,
            Instant expiresAt,
            UUID requestId) {
    }

    record RegistrationChallenge(
            String schemaVersion,
            String nonce,
            Instant issuedAt,
            Instant expiresAt,
            UUID requestId) {
    }

    record RegistrationResult(
            String schemaVersion,
            UUID registrationId,
            String deviceId,
            String entitlementPath,
            UUID requestId) {
    }

    record DeviceProofRequest(
            String schemaVersion,
            SignedEnvelopeV1 challengeProof) {
    }

    record EntitlementDocuments(
            String schemaVersion,
            SignedEnvelopeV1 durableProductGrant,
            SignedEnvelopeV1 onlineServiceLease,
            Instant serverTime,
            UUID requestId) {
    }

    record ReleaseCheckResult(
            String schemaVersion,
            SignedEnvelopeV1 release,
            Instant serverTime,
            UUID requestId) {
    }

    record RegistryCredentialRequest(
            String schemaVersion,
            SignedEnvelopeV1 challengeProof,
            String component,
            String repository,
            String digest) {
    }

    record RegistryCredentialResponse(
            String schemaVersion,
            UUID credentialId,
            String credentialType,
            String username,
            char[] secret,
            String repository,
            String digest,
            Instant expiresAt,
            Instant serverTime,
            UUID requestId) {

        @Override
        public String toString() {
            return "RegistryCredentialResponse["
                    + "schemaVersion=" + schemaVersion
                    + ", credentialId=" + credentialId
                    + ", credentialType=" + credentialType
                    + ", secret=<redacted>"
                    + ", expiresAt=" + expiresAt
                    + ", serverTime=" + serverTime
                    + ", requestId=" + requestId
                    + "]";
        }
    }
}
