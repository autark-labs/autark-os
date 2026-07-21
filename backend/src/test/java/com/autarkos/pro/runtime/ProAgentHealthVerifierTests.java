package com.autarkos.pro.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.extensions.ExtensionSurfaceEnvelope;
import com.autarkos.extensions.ExtensionUiManifest;
import com.autarkos.pro.agent.ProAgentClient;
import com.autarkos.pro.agent.ProAgentClientException;
import com.autarkos.pro.agent.ProAgentEndpoint;
import com.autarkos.pro.agent.ProAgentSmokeSnapshotFactory;
import com.autarkos.pro.model.AgentStatus;
import com.autarkos.pro.module.ProModuleCandidate;
import com.autarkos.pro.module.ProModuleRuntime;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;

class ProAgentHealthVerifierTests {

    private static final Instant NOW =
            Instant.parse("2026-07-19T12:00:00Z");
    private static final byte[] ENTRYPOINT =
            "export function mount(){}".getBytes();
    private static final ProModuleCandidate CANDIDATE =
            ProRuntimeTestFixtures.candidate();
    private static final ProAgentEndpoint ENDPOINT =
            ProAgentEndpoint.forAddress(
                    "127.0.0.1",
                    ProRuntimeTestFixtures.DIGEST);

    @Test
    void validatesStatusManifestEntrypointAndSmokeSurface()
            throws Exception {
        ProDockerEngine docker = mock(ProDockerEngine.class);
        when(docker.candidateHealth(CANDIDATE))
                .thenReturn(health(false, "healthcheck_starting"))
                .thenReturn(health(true, "healthy"));
        when(docker.candidateEndpoint(CANDIDATE)).thenReturn(ENDPOINT);
        int[] sleeps = {0};

        var result = verifier(
                docker,
                healthyClient(),
                ignored -> sleeps[0]++)
                .verifyCandidate(CANDIDATE);

        assertThat(result.healthy()).isTrue();
        assertThat(result.endpoint()).isEqualTo(ENDPOINT);
        assertThat(sleeps[0]).isEqualTo(1);
    }

    @Test
    void rejectsApiManifestDigestAndSurfaceFailures() {
        assertFailure(
                clientWithStatus(status("incompatible", false)),
                "agent_api_incompatible");

        ProAgentClient wrongVersion = healthyClient();
        when(wrongVersion.uiManifest(any())).thenReturn(
                manifest("9.9.9", digest(ENTRYPOINT)));
        assertFailure(wrongVersion, "agent_ui_incompatible");

        ProAgentClient wrongDigest = healthyClient();
        when(wrongDigest.uiManifest(any())).thenReturn(
                manifest(CANDIDATE.manifest().version(),
                        "sha256:" + "0".repeat(64)));
        assertFailure(wrongDigest, "agent_ui_digest_mismatch");

        ProAgentClient failedSurface = healthyClient();
        when(failedSurface.renderSurface(
                        any(), anyString(), any(), nullable(String.class)))
                .thenThrow(new ProAgentClientException(
                        "agent_request_failed", "redacted"));
        assertFailure(failedSurface, "agent_request_failed");
    }

    @Test
    void boundsAContainerThatNeverLeavesStarting() {
        ProDockerEngine docker = mock(ProDockerEngine.class);
        when(docker.candidateHealth(CANDIDATE))
                .thenReturn(health(false, "healthcheck_starting"));
        int[] sleeps = {0};

        var result = verifier(
                docker,
                healthyClient(),
                ignored -> sleeps[0]++)
                .verifyCandidate(CANDIDATE);

        assertThat(result.reasonCode())
                .isEqualTo("candidate_health_timeout");
        assertThat(sleeps[0]).isEqualTo(99);
    }

    @Test
    void activeHealthCombinesContainerAndAuthenticatedStatus() {
        ProDockerEngine docker = mock(ProDockerEngine.class);
        when(docker.activeHealth(ProRuntimeTestFixtures.DIGEST))
                .thenReturn(health(true, "healthy"));
        when(docker.activeEndpoint(ProRuntimeTestFixtures.DIGEST))
                .thenReturn(ENDPOINT);
        var verifier = verifier(docker, healthyClient(), ignored -> { });

        assertThat(verifier.verifyActive(
                        ProRuntimeTestFixtures.DIGEST).healthy())
                .isTrue();

        when(docker.activeHealth(ProRuntimeTestFixtures.DIGEST))
                .thenReturn(health(false, "container_crash_loop"));
        assertThat(verifier.verifyActive(
                        ProRuntimeTestFixtures.DIGEST).reasonCode())
                .isEqualTo("container_crash_loop");
    }

    private static void assertFailure(
            ProAgentClient client,
            String reason) {
        ProDockerEngine docker = mock(ProDockerEngine.class);
        when(docker.candidateHealth(CANDIDATE))
                .thenReturn(health(true, "healthy"));
        when(docker.candidateEndpoint(CANDIDATE)).thenReturn(ENDPOINT);

        var result = verifier(docker, client, ignored -> { })
                .verifyCandidate(CANDIDATE);

        assertThat(result.healthy()).isFalse();
        assertThat(result.reasonCode()).isEqualTo(reason);
    }

    private static ProAgentHealthVerifier verifier(
            ProDockerEngine docker,
            ProAgentClient client,
            ProAgentHealthVerifier.Sleeper sleeper) {
        return new ProAgentHealthVerifier(
                docker,
                client,
                new ProAgentSmokeSnapshotFactory(),
                Duration.ofSeconds(1),
                Duration.ofMillis(10),
                Clock.fixed(NOW, ZoneOffset.UTC),
                sleeper,
                "1.2.3",
                "linux/amd64");
    }

    private static ProAgentClient healthyClient() {
        ProAgentClient client = mock(ProAgentClient.class);
        when(client.status(any())).thenReturn(status("ready", true));
        when(client.uiManifest(any())).thenReturn(manifest(
                CANDIDATE.manifest().version(), digest(ENTRYPOINT)));
        when(client.uiAsset(any(), anyString())).thenReturn(ENTRYPOINT);
        when(client.renderSurface(
                        any(), anyString(), any(), nullable(String.class)))
                .thenReturn(new ExtensionSurfaceEnvelope(
                        "1", "pro.dashboard", null,
                        JsonNodeFactory.instance.objectNode()));
        return client;
    }

    private static ProAgentClient clientWithStatus(AgentStatus status) {
        ProAgentClient client = healthyClient();
        when(client.status(any())).thenReturn(status);
        return client;
    }

    private static AgentStatus status(String state, boolean ready) {
        return new AgentStatus(
                "1", CANDIDATE.manifest().version(), "1",
                List.of("1"), List.of("1"), state, ready,
                ready ? "none" : "unsupported_api", NOW);
    }

    private static ExtensionUiManifest manifest(
            String version,
            String digest) {
        return new ExtensionUiManifest(
                "1", "autark-pro", version, "entry.js", digest,
                List.of("pro.dashboard"));
    }

    private static String digest(byte[] contents) {
        try {
            return "sha256:" + HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(contents));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static ProModuleRuntime.HealthResult health(
            boolean healthy,
            String reason) {
        return new ProModuleRuntime.HealthResult(healthy, reason);
    }
}
