package com.autarkos.pro.module;

import java.time.Instant;

import com.autarkos.pro.model.ProModuleState;
import com.autarkos.pro.model.SignedEnvelopeV1;

public record ProModuleSnapshot(
        ProModuleState state,
        String operation,
        String jobId,
        String component,
        String componentVersion,
        String agentApiRange,
        String activeDigest,
        String activeManifestFingerprint,
        String previousDigest,
        String previousComponentVersion,
        String previousAgentApiRange,
        String previousManifestFingerprint,
        String candidateDigest,
        String candidateVersion,
        String candidateAgentApiRange,
        Long candidateManifestSequence,
        String candidateManifestFingerprint,
        SignedEnvelopeV1 candidateEnvelope,
        Long acceptedManifestSequence,
        String health,
        String lastHealthResult,
        Instant lastSuccessfulTransitionAt,
        String lastErrorCode,
        String lastErrorMessage,
        long revision,
        Instant updatedAt) {

    public static ProModuleSnapshot notInstalled(Instant now) {
        return new ProModuleSnapshot(
                ProModuleState.NOT_INSTALLED,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "not-checked",
                null,
                now,
                null,
                null,
                0,
                now);
    }

    public ProModuleSnapshot withState(
            ProModuleState nextState,
            String nextOperation,
            String nextJobId,
            String nextHealth,
            String healthResult,
            String errorCode,
            String errorMessage,
            Instant now) {
        return new ProModuleSnapshot(
                nextState,
                nextOperation,
                nextJobId,
                component,
                componentVersion,
                agentApiRange,
                activeDigest,
                activeManifestFingerprint,
                previousDigest,
                previousComponentVersion,
                previousAgentApiRange,
                previousManifestFingerprint,
                candidateDigest,
                candidateVersion,
                candidateAgentApiRange,
                candidateManifestSequence,
                candidateManifestFingerprint,
                candidateEnvelope,
                acceptedManifestSequence,
                nextHealth,
                healthResult,
                nextState == ProModuleState.ERROR
                        ? lastSuccessfulTransitionAt
                        : now,
                errorCode,
                errorMessage,
                revision,
                now);
    }

    public ProModuleSnapshot withCandidate(
            ProModuleCandidate candidate,
            String nextOperation,
            String nextJobId,
            Instant now) {
        return new ProModuleSnapshot(
                ProModuleState.RELEASE_AVAILABLE,
                nextOperation,
                nextJobId,
                component,
                componentVersion,
                agentApiRange,
                activeDigest,
                activeManifestFingerprint,
                previousDigest,
                previousComponentVersion,
                previousAgentApiRange,
                previousManifestFingerprint,
                candidate.manifest().digest(),
                candidate.manifest().version(),
                candidate.manifest().agentApiRange(),
                candidate.manifest().sequence(),
                candidate.fingerprint(),
                candidate.envelope(),
                candidate.manifest().sequence(),
                health,
                lastHealthResult,
                now,
                null,
                null,
                revision,
                now);
    }

    public ProModuleSnapshot activateCandidate(
            String nextJobId,
            String healthResult,
            Instant now) {
        return new ProModuleSnapshot(
                ProModuleState.ACTIVE,
                null,
                nextJobId,
                "autark-pro-agent",
                candidateVersion,
                candidateAgentApiRange,
                candidateDigest,
                candidateManifestFingerprint,
                activeDigest,
                componentVersion,
                agentApiRange,
                activeManifestFingerprint,
                null,
                null,
                null,
                null,
                null,
                null,
                acceptedManifestSequence,
                "healthy",
                healthResult,
                now,
                null,
                null,
                revision,
                now);
    }

    public ProModuleSnapshot clearCandidate(
            ProModuleState nextState,
            String nextOperation,
            String nextJobId,
            String nextHealth,
            String healthResult,
            Instant now) {
        return new ProModuleSnapshot(
                nextState,
                nextOperation,
                nextJobId,
                component,
                componentVersion,
                agentApiRange,
                activeDigest,
                activeManifestFingerprint,
                previousDigest,
                previousComponentVersion,
                previousAgentApiRange,
                previousManifestFingerprint,
                null,
                null,
                null,
                null,
                null,
                null,
                acceptedManifestSequence,
                nextHealth,
                healthResult,
                now,
                null,
                null,
                revision,
                now);
    }

    public ProModuleSnapshot restorePrevious(
            String nextJobId,
            String healthResult,
            Instant now) {
        if (previousDigest == null
                || previousComponentVersion == null
                || previousAgentApiRange == null
                || previousManifestFingerprint == null) {
            throw new IllegalStateException(
                    "A complete rollback generation is required.");
        }
        return new ProModuleSnapshot(
                ProModuleState.ACTIVE,
                null,
                nextJobId,
                "autark-pro-agent",
                previousComponentVersion,
                previousAgentApiRange,
                previousDigest,
                previousManifestFingerprint,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                acceptedManifestSequence,
                "healthy",
                healthResult,
                now,
                null,
                null,
                revision,
                now);
    }

    public ProModuleSnapshot clearPrevious(Instant now) {
        return new ProModuleSnapshot(
                state,
                operation,
                jobId,
                component,
                componentVersion,
                agentApiRange,
                activeDigest,
                activeManifestFingerprint,
                null,
                null,
                null,
                null,
                candidateDigest,
                candidateVersion,
                candidateAgentApiRange,
                candidateManifestSequence,
                candidateManifestFingerprint,
                candidateEnvelope,
                acceptedManifestSequence,
                health,
                lastHealthResult,
                lastSuccessfulTransitionAt,
                lastErrorCode,
                lastErrorMessage,
                revision,
                now);
    }
}
