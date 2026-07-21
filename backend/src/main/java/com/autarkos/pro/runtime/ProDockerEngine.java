package com.autarkos.pro.runtime;

import java.nio.file.Path;

import com.autarkos.pro.agent.ProAgentEndpoint;
import com.autarkos.pro.module.ProModuleCandidate;
import com.autarkos.pro.module.ProModuleRuntime;
import com.autarkos.pro.registry.RegistryCredential;

public interface ProDockerEngine {

    void pullExact(
            ProModuleCandidate candidate,
            RegistryCredential credential);

    void verifyExactDigest(ProModuleCandidate candidate);

    void startCandidate(
            ProModuleCandidate candidate,
            Path apiCredentialPath);

    ProModuleRuntime.HealthResult candidateHealth(
            ProModuleCandidate candidate);

    ProAgentEndpoint candidateEndpoint(
            ProModuleCandidate candidate);

    ProModuleRuntime.HealthResult activeHealth(
            String activeDigest);

    ProAgentEndpoint activeEndpoint(String activeDigest);

    void activateCandidate(ProModuleCandidate candidate);

    void discardCandidate(String candidateDigest);

    void discardPrevious(String activeDigest, String previousDigest);

    void rollback(
            String activeDigest,
            String previousDigest,
            String candidateDigest);

    void remove(String activeDigest, String previousDigest);
}
