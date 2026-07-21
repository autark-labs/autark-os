package com.autarkos.pro.runtime;

import java.nio.file.Path;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Component;

import com.autarkos.pro.agent.ProAgentClientRouter;
import com.autarkos.pro.agent.ProAgentEndpoint;
import com.autarkos.pro.module.ProModuleCandidate;
import com.autarkos.pro.module.ProModuleRuntime;
import com.autarkos.pro.registry.RegistryCredentialClient;
import com.autarkos.pro.release.ReleaseManifestVerifier;
import com.autarkos.pro.release.ReleaseStateRepository;

@Component
public class ProAgentRuntime implements ProModuleRuntime {

    private final RegistryCredentialClient registryCredentials;
    private final ProAgentApiCredentialStore apiCredentialStore;
    private final ProDockerEngine docker;
    private final ProAgentHealthVerifier healthVerifier;
    private final ProAgentClientRouter router;
    private final AtomicReference<VerifiedCandidate>
            verifiedCandidate = new AtomicReference<>();

    public ProAgentRuntime(
            RegistryCredentialClient registryCredentials,
            ProAgentApiCredentialStore apiCredentialStore,
            ProDockerEngine docker,
            ProAgentHealthVerifier healthVerifier,
            ProAgentClientRouter router) {
        this.registryCredentials = Objects.requireNonNull(
                registryCredentials);
        this.apiCredentialStore = Objects.requireNonNull(
                apiCredentialStore);
        this.docker = Objects.requireNonNull(docker);
        this.healthVerifier = Objects.requireNonNull(
                healthVerifier);
        this.router = Objects.requireNonNull(router);
    }

    @Override
    public void download(ProModuleCandidate candidate) {
        requireCandidate(candidate);
        registryCredentials.withCredential(
                verified(candidate),
                credential -> {
                    docker.pullExact(candidate, credential);
                    return null;
                });
    }

    @Override
    public void verifyImage(ProModuleCandidate candidate) {
        requireCandidate(candidate);
        docker.verifyExactDigest(candidate);
    }

    @Override
    public void startCandidate(ProModuleCandidate candidate) {
        requireCandidate(candidate);
        verifiedCandidate.set(null);
        Path credentialPath = apiCredentialStore.prepareMount();
        docker.startCandidate(candidate, credentialPath);
    }

    @Override
    public HealthResult healthCheck(ProModuleCandidate candidate) {
        requireCandidate(candidate);
        ProAgentHealthVerifier.Verification result =
                healthVerifier.verifyCandidate(candidate);
        if (result.healthy() && result.endpoint() != null) {
            verifiedCandidate.set(new VerifiedCandidate(
                    candidate.manifest().digest(),
                    result.endpoint()));
        } else {
            verifiedCandidate.set(null);
        }
        return new HealthResult(
                result.healthy(),
                result.reasonCode());
    }

    @Override
    public void activateCandidate(ProModuleCandidate candidate) {
        requireCandidate(candidate);
        VerifiedCandidate verified = verifiedCandidate.get();
        if (verified == null
                || !candidate.manifest().digest().equals(
                        verified.digest())) {
            throw new com.autarkos.pro.module.ProModuleException(
                    "candidate_health_authority_missing",
                    "Autark Pro candidate health authority is missing.");
        }
        docker.activateCandidate(candidate);
        router.activate(verified.endpoint());
        verifiedCandidate.set(null);
    }

    @Override
    public HealthResult activeHealth(String activeDigest) {
        return healthVerifier.verifyActive(activeDigest);
    }

    @Override
    public void reconcileRouting(String activeDigest) {
        verifiedCandidate.set(null);
        if (activeDigest == null) {
            router.clear();
            return;
        }
        router.activate(docker.activeEndpoint(activeDigest));
    }

    @Override
    public void discardCandidate(String candidateDigest) {
        verifiedCandidate.set(null);
        docker.discardCandidate(candidateDigest);
    }

    @Override
    public void discardPrevious(
            String activeDigest,
            String previousDigest) {
        docker.discardPrevious(activeDigest, previousDigest);
    }

    @Override
    public void rollback(
            String activeDigest,
            String previousDigest,
            String candidateDigest) {
        docker.rollback(
                activeDigest,
                previousDigest,
                candidateDigest);
        reconcileRouting(activeDigest);
    }

    @Override
    public void remove(
            String activeDigest,
            String previousDigest) {
        docker.remove(activeDigest, previousDigest);
        router.clear();
        verifiedCandidate.set(null);
        apiCredentialStore.delete();
    }

    private static ReleaseManifestVerifier.VerifiedRelease verified(
            ProModuleCandidate candidate) {
        return new ReleaseManifestVerifier.VerifiedRelease(
                candidate.manifest(),
                candidate.fingerprint(),
                ReleaseStateRepository.AcceptanceResult.IDEMPOTENT);
    }

    private static void requireCandidate(ProModuleCandidate candidate) {
        Objects.requireNonNull(candidate, "Pro module candidate is required.");
    }

    private record VerifiedCandidate(
            String digest,
            ProAgentEndpoint endpoint) {
    }
}
