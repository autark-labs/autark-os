package com.autarkos.pro.runtime;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.autarkos.pro.agent.ProAgentClient;
import com.autarkos.pro.agent.ProAgentClientException;
import com.autarkos.pro.agent.ProAgentEndpoint;
import com.autarkos.pro.agent.ProAgentSmokeSnapshotFactory;
import com.autarkos.pro.model.AgentStatus;
import com.autarkos.pro.module.ProModuleCandidate;
import com.autarkos.pro.module.ProModuleRuntime;

@Component
public final class ProAgentHealthVerifier {

    private final ProDockerEngine docker;
    private final ProAgentClient client;
    private final ProAgentSmokeSnapshotFactory smokeSnapshots;
    private final Duration startupTimeout;
    private final Duration pollInterval;
    private final Clock clock;
    private final Sleeper sleeper;
    private final String coreVersion;
    private final String architecture;

    @Autowired
    public ProAgentHealthVerifier(
            ProDockerEngine docker,
            ProAgentClient client,
            ProAgentSmokeSnapshotFactory smokeSnapshots,
            @Value("${autark.pro.agent-startup-timeout:45s}")
                    Duration startupTimeout,
            @Value("${autark.pro.agent-health-poll-interval:250ms}")
                    Duration pollInterval,
            @Value("${autark.pro.core-version:${AUTARK_OS_VERSION:0.0.1-SNAPSHOT}}")
                    String coreVersion,
            @Value("${autark.pro.architecture:}")
                    String configuredArchitecture) {
        this(
                docker,
                client,
                smokeSnapshots,
                startupTimeout,
                pollInterval,
                Clock.systemUTC(),
                Thread::sleep,
                coreVersion,
                ProRuntimeArchitecture.resolve(
                        configuredArchitecture));
    }

    ProAgentHealthVerifier(
            ProDockerEngine docker,
            ProAgentClient client,
            ProAgentSmokeSnapshotFactory smokeSnapshots,
            Duration startupTimeout,
            Duration pollInterval,
            Clock clock,
            Sleeper sleeper,
            String coreVersion,
            String architecture) {
        this.docker = Objects.requireNonNull(docker);
        this.client = Objects.requireNonNull(client);
        this.smokeSnapshots = Objects.requireNonNull(smokeSnapshots);
        this.startupTimeout = requireDuration(
                startupTimeout,
                Duration.ofSeconds(1),
                Duration.ofMinutes(2));
        this.pollInterval = requireDuration(
                pollInterval,
                Duration.ofMillis(10),
                Duration.ofSeconds(5));
        this.clock = Objects.requireNonNull(clock);
        this.sleeper = Objects.requireNonNull(sleeper);
        this.coreVersion = Objects.requireNonNull(coreVersion);
        this.architecture = Objects.requireNonNull(architecture);
    }

    public Verification verifyCandidate(
            ProModuleCandidate candidate) {
        Objects.requireNonNull(candidate);
        int attempts = Math.max(
                1,
                (int) Math.ceil(
                        (double) startupTimeout.toMillis()
                                / pollInterval.toMillis()));
        ProModuleRuntime.HealthResult containerHealth = null;
        for (int attempt = 0; attempt < attempts; attempt++) {
            containerHealth = docker.candidateHealth(candidate);
            if (containerHealth != null
                    && containerHealth.healthy()) {
                break;
            }
            String reason = containerHealth == null
                    ? "healthcheck_unavailable"
                    : containerHealth.reasonCode();
            if (!"healthcheck_starting".equals(reason)) {
                return Verification.failed(
                        safeReason(reason));
            }
            if (attempt + 1 < attempts
                    && !sleep(pollInterval)) {
                return Verification.failed(
                        "healthcheck_interrupted");
            }
        }
        if (containerHealth == null
                || !containerHealth.healthy()) {
            return Verification.failed(
                    "candidate_health_timeout");
        }

        try {
            ProAgentEndpoint endpoint =
                    docker.candidateEndpoint(candidate);
            AgentStatus status = client.status(endpoint);
            if (!status.ready()
                    || !"ready".equals(status.state())
                    || !candidate.manifest().version().equals(
                            status.componentVersion())
                    || !"1".equals(status.apiVersion())
                    || !status.supportedSnapshotSchemaVersions()
                            .contains("1")
                    || !status.supportedSurfaceSchemaVersions()
                            .contains("1")) {
                return Verification.failed(
                        "agent_api_incompatible");
            }
            var manifest = client.uiManifest(endpoint);
            if (!candidate.manifest().version().equals(
                            manifest.componentVersion())
                    || manifest.surfaces().isEmpty()) {
                return Verification.failed(
                        "agent_ui_incompatible");
            }
            var snapshot = smokeSnapshots.create(
                    coreVersion,
                    architecture,
                    clock.instant());
            byte[] entrypoint = client.uiAsset(
                    endpoint, manifest.entrypoint());
            if (!manifest.entrypointSha256().equals(
                    sha256(entrypoint))) {
                return Verification.failed(
                        "agent_ui_digest_mismatch");
            }
            client.renderSurface(
                    endpoint,
                    manifest.surfaces().getFirst(),
                    snapshot,
                    null);
            return new Verification(
                    true,
                    "healthy",
                    endpoint);
        } catch (ProAgentClientException exception) {
            return Verification.failed(
                    safeReason(exception.code()));
        } catch (RuntimeException exception) {
            return Verification.failed(
                    "agent_health_check_failed");
        }
    }

    public ProModuleRuntime.HealthResult verifyActive(
            String activeDigest) {
        ProModuleRuntime.HealthResult container =
                docker.activeHealth(activeDigest);
        if (container == null || !container.healthy()) {
            return container == null
                    ? new ProModuleRuntime.HealthResult(
                            false,
                            "healthcheck_unavailable")
                    : container;
        }
        try {
            ProAgentEndpoint endpoint =
                    docker.activeEndpoint(activeDigest);
            AgentStatus status = client.status(endpoint);
            if (!status.ready()
                    || !"ready".equals(status.state())) {
                return new ProModuleRuntime.HealthResult(
                        false,
                        "agent_not_ready");
            }
            return new ProModuleRuntime.HealthResult(
                    true,
                    "healthy");
        } catch (ProAgentClientException exception) {
            return new ProModuleRuntime.HealthResult(
                    false,
                    safeReason(exception.code()));
        } catch (RuntimeException exception) {
            return new ProModuleRuntime.HealthResult(
                    false,
                    "agent_health_check_failed");
        }
    }

    private boolean sleep(Duration duration) {
        try {
            sleeper.sleep(duration.toMillis());
            return true;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static Duration requireDuration(
            Duration value,
            Duration minimum,
            Duration maximum) {
        if (value == null
                || value.compareTo(minimum) < 0
                || value.compareTo(maximum) > 0) {
            throw new IllegalArgumentException(
                    "Invalid Pro agent health duration.");
        }
        return value;
    }

    private static String safeReason(String reason) {
        return reason != null
                        && reason.matches(
                                "^[a-z][a-z0-9_]{0,63}$")
                ? reason
                : "agent_health_check_failed";
    }

    private static String sha256(byte[] contents) {
        try {
            return "sha256:" + HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(contents));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 is unavailable.", exception);
        }
    }

    record Verification(
            boolean healthy,
            String reasonCode,
            ProAgentEndpoint endpoint) {

        private static Verification failed(String reasonCode) {
            return new Verification(
                    false,
                    reasonCode,
                    null);
        }
    }

    @FunctionalInterface
    interface Sleeper {
        void sleep(long milliseconds)
                throws InterruptedException;
    }
}
