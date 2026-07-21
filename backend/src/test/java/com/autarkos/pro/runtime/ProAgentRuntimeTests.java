package com.autarkos.pro.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Constructor;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.pro.agent.ProAgentClient;
import com.autarkos.pro.agent.ProAgentClientRouter;
import com.autarkos.pro.agent.ProAgentEndpoint;
import com.autarkos.pro.module.ProModuleCandidate;
import com.autarkos.pro.module.ProModuleException;
import com.autarkos.pro.module.ProModuleRuntime;
import com.autarkos.pro.registry.RegistryCredential;
import com.autarkos.pro.registry.RegistryCredentialClient;

class ProAgentRuntimeTests {

    @TempDir
    Path directory;

    @Test
    void runtimeUsesScopedCredentialThenDelegatesEveryBoundary()
            throws Exception {
        RegistryCredentialClient registry =
                mock(RegistryCredentialClient.class);
        RegistryCredential credential = credential();
        doAnswer(invocation -> {
            RegistryCredentialClient.CredentialOperation<?, ?>
                    operation = invocation.getArgument(1);
            operation.apply(credential);
            return null;
        }).when(registry).withCredential(any(), any());
        RecordingDocker docker = new RecordingDocker();
        Path secret = directory.resolve(
                "pro-agent/secrets/agent-api-token");
        ProAgentApiCredentialStore store =
                new ProAgentApiCredentialStore(
                        secret,
                        new SecureRandom());
        ProAgentHealthVerifier verifier =
                mock(ProAgentHealthVerifier.class);
        ProAgentEndpoint candidateEndpoint =
                ProAgentEndpoint.forAddress(
                        "127.0.0.1",
                        ProRuntimeTestFixtures.DIGEST);
        when(verifier.verifyCandidate(any())).thenReturn(
                new ProAgentHealthVerifier.Verification(
                        true,
                        "healthy",
                        candidateEndpoint));
        ProAgentClientRouter router =
                new ProAgentClientRouter(
                        mock(ProAgentClient.class));
        ProAgentRuntime runtime = new ProAgentRuntime(
                registry,
                store,
                docker,
                verifier,
                router);
        ProModuleCandidate candidate =
                ProRuntimeTestFixtures.candidate();

        runtime.download(candidate);
        runtime.verifyImage(candidate);
        runtime.startCandidate(candidate);
        ProModuleRuntime.HealthResult health =
                runtime.healthCheck(candidate);
        runtime.activateCandidate(candidate);
        assertThat(router.activeEndpoint())
                .contains(candidateEndpoint);
        runtime.rollback(
                ProRuntimeTestFixtures.DIGEST,
                ProRuntimeTestFixtures.PREVIOUS_DIGEST,
                candidate.manifest().digest());
        runtime.discardCandidate(candidate.manifest().digest());
        runtime.discardPrevious(
                ProRuntimeTestFixtures.DIGEST,
                ProRuntimeTestFixtures.PREVIOUS_DIGEST);
        runtime.remove(
                ProRuntimeTestFixtures.DIGEST,
                ProRuntimeTestFixtures.PREVIOUS_DIGEST);

        assertThat(health.healthy()).isTrue();
        assertThat(docker.calls).containsExactly(
                "pull",
                "verify",
                "start",
                "activate",
                "rollback",
                "active-endpoint",
                "discard",
                "discard-previous",
                "remove");
        assertThat(docker.secretPath).isEqualTo(secret);
        assertThat(secret).doesNotExist();
        assertThat(router.activeEndpoint()).isEmpty();
        credential.close();
    }

    @Test
    void failedDockerCutoverNeverChangesActiveRouting()
            throws Exception {
        RegistryCredentialClient registry =
                mock(RegistryCredentialClient.class);
        RecordingDocker docker = new RecordingDocker();
        docker.failActivate = true;
        Path secret = directory.resolve(
                "failure/secrets/agent-api-token");
        ProAgentApiCredentialStore store =
                new ProAgentApiCredentialStore(
                        secret,
                        new SecureRandom());
        ProAgentHealthVerifier verifier =
                mock(ProAgentHealthVerifier.class);
        ProModuleCandidate candidate =
                ProRuntimeTestFixtures.candidate();
        ProAgentEndpoint candidateEndpoint =
                ProAgentEndpoint.forAddress(
                        "127.0.0.1",
                        candidate.manifest().digest());
        when(verifier.verifyCandidate(candidate)).thenReturn(
                new ProAgentHealthVerifier.Verification(
                        true,
                        "healthy",
                        candidateEndpoint));
        ProAgentClientRouter router =
                new ProAgentClientRouter(
                        mock(ProAgentClient.class));
        ProAgentEndpoint oldEndpoint =
                ProAgentEndpoint.forAddress(
                        "127.0.0.1",
                        ProRuntimeTestFixtures.PREVIOUS_DIGEST);
        router.activate(oldEndpoint);
        ProAgentRuntime runtime = new ProAgentRuntime(
                registry,
                store,
                docker,
                verifier,
                router);

        runtime.startCandidate(candidate);
        assertThat(runtime.healthCheck(candidate).healthy())
                .isTrue();
        assertThatThrownBy(() ->
                runtime.activateCandidate(candidate))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo("module_cutover_failed");

        assertThat(router.activeEndpoint())
                .contains(oldEndpoint);
    }

    private static RegistryCredential credential() throws Exception {
        Constructor<RegistryCredential> constructor =
                RegistryCredential.class.getDeclaredConstructor(
                        UUID.class,
                        String.class,
                        char[].class,
                        String.class,
                        String.class,
                        Instant.class);
        constructor.setAccessible(true);
        return constructor.newInstance(
                UUID.fromString(
                        "11111111-1111-4111-8111-111111111111"),
                "autark-pro-token",
                "aaa.bbb.ccc".toCharArray(),
                ProRuntimeTestFixtures.REPOSITORY,
                ProRuntimeTestFixtures.DIGEST,
                Instant.parse("2026-07-19T12:05:00Z"));
    }

    private static final class RecordingDocker
            implements ProDockerEngine {

        private final List<String> calls = new ArrayList<>();
        private Path secretPath;
        private boolean failActivate;

        @Override
        public void pullExact(
                ProModuleCandidate candidate,
                RegistryCredential credential) {
            calls.add("pull");
        }

        @Override
        public void verifyExactDigest(
                ProModuleCandidate candidate) {
            calls.add("verify");
        }

        @Override
        public void startCandidate(
                ProModuleCandidate candidate,
                Path apiCredentialPath) {
            calls.add("start");
            secretPath = apiCredentialPath;
        }

        @Override
        public ProModuleRuntime.HealthResult candidateHealth(
                ProModuleCandidate candidate) {
            calls.add("health");
            return new ProModuleRuntime.HealthResult(
                    true,
                    "healthy");
        }

        @Override
        public ProAgentEndpoint candidateEndpoint(
                ProModuleCandidate candidate) {
            calls.add("candidate-endpoint");
            return ProAgentEndpoint.forAddress(
                    "127.0.0.1",
                    candidate.manifest().digest());
        }

        @Override
        public ProModuleRuntime.HealthResult activeHealth(
                String activeDigest) {
            calls.add("active-health");
            return new ProModuleRuntime.HealthResult(
                    true,
                    "healthy");
        }

        @Override
        public ProAgentEndpoint activeEndpoint(
                String activeDigest) {
            calls.add("active-endpoint");
            return ProAgentEndpoint.forAddress(
                    "127.0.0.1",
                    activeDigest);
        }

        @Override
        public void activateCandidate(
                ProModuleCandidate candidate) {
            calls.add("activate");
            if (failActivate) {
                throw new ProModuleException(
                        "module_cutover_failed",
                        "Cutover failed.");
            }
        }

        @Override
        public void discardCandidate(String candidateDigest) {
            calls.add("discard");
        }

        @Override
        public void discardPrevious(
                String activeDigest,
                String previousDigest) {
            calls.add("discard-previous");
        }

        @Override
        public void rollback(
                String activeDigest,
                String previousDigest,
                String candidateDigest) {
            calls.add("rollback");
        }

        @Override
        public void remove(
                String activeDigest,
                String previousDigest) {
            calls.add("remove");
        }
    }
}
