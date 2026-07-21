package com.autarkos.pro.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.agent.HttpProAgentClient;
import com.autarkos.pro.agent.ProAgentClientRouter;
import com.autarkos.pro.agent.ProAgentContractValidator;
import com.autarkos.pro.agent.ProAgentSmokeSnapshotFactory;
import com.autarkos.pro.model.ProReleaseManifest;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.autarkos.pro.module.ProModuleCandidate;
import com.autarkos.pro.registry.RegistryCredentialClient;
import com.autarkos.system.SystemCommandRunner;

@EnabledIfEnvironmentVariable(
        named = "AUTARK_PRO_LIVE_HEALTHY_REPOSITORY",
        matches = ".+")
class ProAgentLiveCutoverTests {

    @Test
    void healthyCutoverAndBrokenCandidateRollbackUseOneRoute() {
        String repository = required(
                "AUTARK_PRO_LIVE_HEALTHY_REPOSITORY");
        String healthyDigest = required(
                "AUTARK_PRO_LIVE_HEALTHY_DIGEST");
        String healthyVersion = required(
                "AUTARK_PRO_LIVE_HEALTHY_VERSION");
        String brokenRepository = required(
                "AUTARK_PRO_LIVE_BROKEN_REPOSITORY");
        String brokenDigest = required(
                "AUTARK_PRO_LIVE_BROKEN_DIGEST");
        String runtimeRoot = required(
                "AUTARK_PRO_LIVE_RUNTIME_ROOT");
        AutarkOsRuntimeProperties properties =
                new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot);
        RuntimeLayout layout = new RuntimeLayout(properties);
        ProcessProDockerEngine docker =
                new ProcessProDockerEngine(
                        new SystemCommandRunner(),
                        layout,
                        new ProContainerPolicy(),
                        (candidate, configuration) -> {
                            // The live runtime/cutover harness uses an
                            // ephemeral unsigned local registry. Real Cosign
                            // verification has its own PRO-115 integration.
                        });
        ProAgentApiCredentialStore credentials =
                new ProAgentApiCredentialStore(layout);
        Duration requestTimeout = Duration.ofSeconds(2);
        ProAgentContractValidator validator =
                new ProAgentContractValidator();
        HttpProAgentClient client = new HttpProAgentClient(
                credentials,
                validator,
                requestTimeout);
        ProAgentClientRouter router =
                new ProAgentClientRouter(client);
        ProAgentHealthVerifier health =
                new ProAgentHealthVerifier(
                        docker,
                        client,
                        new ProAgentSmokeSnapshotFactory(),
                        Duration.ofSeconds(30),
                        Duration.ofMillis(100),
                        Clock.systemUTC(),
                        Thread::sleep,
                        "1.2.3",
                        "linux/amd64");
        ProAgentRuntime runtime = new ProAgentRuntime(
                mock(RegistryCredentialClient.class),
                credentials,
                docker,
                health,
                router);
        ProModuleCandidate healthy = candidate(
                repository,
                healthyDigest,
                healthyVersion,
                1);
        ProModuleCandidate broken = candidate(
                brokenRepository,
                brokenDigest,
                "0.1.1",
                2);

        try {
            runtime.startCandidate(healthy);
            var healthyResult =
                    runtime.healthCheck(healthy);
            assertThat(healthyResult.healthy()).isTrue();
            runtime.activateCandidate(healthy);
            assertThat(router.activeEndpoint())
                    .get()
                    .extracting(endpoint -> endpoint.digest())
                    .isEqualTo(healthyDigest);

            runtime.startCandidate(broken);
            var brokenResult =
                    runtime.healthCheck(broken);
            assertThat(brokenResult.healthy()).isFalse();
            assertThat(brokenResult.reasonCode())
                    .isIn(
                            "container_not_running",
                            "healthcheck_unavailable",
                            "healthcheck_failed");
            runtime.rollback(
                    healthyDigest,
                    null,
                    brokenDigest);

            assertThat(router.activeEndpoint())
                    .get()
                    .extracting(endpoint -> endpoint.digest())
                    .isEqualTo(healthyDigest);
            assertThat(runtime.activeHealth(
                            healthyDigest)
                    .healthy()).isTrue();
        } finally {
            runtime.remove(healthyDigest, null);
        }
    }

    private static ProModuleCandidate candidate(
            String repository,
            String digest,
            String version,
            long sequence) {
        Instant now = Instant.now();
        return new ProModuleCandidate(
                new ProReleaseManifest(
                        "1",
                        sequence,
                        now,
                        now.plus(Duration.ofHours(1)),
                        "staging",
                        "autark-pro-agent",
                        version,
                        repository,
                        digest,
                        "linux/amd64",
                        now,
                        "1.0.0",
                        null,
                        "1.x",
                        "prototype",
                        List.of("autark-pro.extension"),
                        "release-test-key"),
                "sha256:" + "f".repeat(64),
                new SignedEnvelopeV1("eA", "eA", "eA"));
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Missing live Pro runtime test input.");
        }
        return value;
    }
}
