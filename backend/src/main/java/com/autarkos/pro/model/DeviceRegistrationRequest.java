package com.autarkos.pro.model;

public record DeviceRegistrationRequest(
        String schemaVersion,
        String idempotencyKey,
        String activationTicket,
        Ed25519PublicJwk publicKey,
        SignedEnvelopeV1 challengeProof) {

    public record Ed25519PublicJwk(
            String crv,
            String kty,
            String x) {
    }
}
