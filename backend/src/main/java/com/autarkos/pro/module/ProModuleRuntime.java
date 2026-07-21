package com.autarkos.pro.module;

public interface ProModuleRuntime {

    void download(ProModuleCandidate candidate);

    void verifyImage(ProModuleCandidate candidate);

    void startCandidate(ProModuleCandidate candidate);

    HealthResult healthCheck(ProModuleCandidate candidate);

    void activateCandidate(ProModuleCandidate candidate);

    HealthResult activeHealth(String activeDigest);

    void reconcileRouting(String activeDigest);

    void discardCandidate(String candidateDigest);

    void discardPrevious(String activeDigest, String previousDigest);

    void rollback(
            String activeDigest,
            String previousDigest,
            String candidateDigest);

    void remove(String activeDigest, String previousDigest);

    record HealthResult(boolean healthy, String reasonCode) {
    }
}
