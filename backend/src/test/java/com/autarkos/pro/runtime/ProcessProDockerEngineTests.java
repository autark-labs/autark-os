package com.autarkos.pro.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Constructor;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.module.ProModuleException;
import com.autarkos.pro.registry.RegistryCredential;
import com.autarkos.system.SystemCommandRunner;

class ProcessProDockerEngineTests {

    private static final String TOKEN = "aaa.bbb.ccc";

    @TempDir
    Path runtimeRoot;

    @Test
    void exactPullUsesEphemeralRegistryTokenConfigAndDeletesIt()
            throws Exception {
        AtomicReference<String> configuration =
                new AtomicReference<>();
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("pull")) {
                Path config = Path.of(command.get(
                        command.indexOf("--config") + 1))
                        .resolve("config.json");
                try {
                    configuration.set(Files.readString(config));
                } catch (Exception exception) {
                    throw new AssertionError(exception);
                }
            }
            return success();
        });
        ProcessProDockerEngine engine = engine(runner);
        RegistryCredential credential = credential(
                ProRuntimeTestFixtures.REPOSITORY,
                ProRuntimeTestFixtures.DIGEST);

        engine.pullExact(
                ProRuntimeTestFixtures.candidate(),
                credential);

        assertThat(configuration.get())
                .contains("\"registrytoken\":\"" + TOKEN + "\"")
                .contains(
                        "\"registry.staging.autarklabs.com\"");
        assertThat(runner.commands)
                .anySatisfy(command -> assertThat(command)
                        .containsSubsequence(
                                "docker",
                                "--config")
                        .endsWith(
                                "pull",
                                ProRuntimeTestFixtures.REPOSITORY
                                        + "@"
                                        + ProRuntimeTestFixtures.DIGEST));
        assertThat(runner.commands.toString())
                .doesNotContain(TOKEN);
        try (var children = Files.list(
                layout().proRegistryPullRoot())) {
            assertThat(children).isEmpty();
        }
        credential.close();
    }

    @Test
    void failedPullStillDeletesCredentialMaterial() throws Exception {
        RecordingRunner runner = new RecordingRunner(command ->
                command.contains("pull")
                        ? failure()
                        : success());
        ProcessProDockerEngine engine = engine(runner);
        RegistryCredential credential = credential(
                ProRuntimeTestFixtures.REPOSITORY,
                ProRuntimeTestFixtures.DIGEST);

        assertThatThrownBy(() -> engine.pullExact(
                        ProRuntimeTestFixtures.candidate(),
                        credential))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo("module_image_pull_failed");
        try (var children = Files.list(
                layout().proRegistryPullRoot())) {
            assertThat(children).isEmpty();
        }
        credential.close();
    }

    @Test
    void failedSignatureVerificationStillDeletesCredentialMaterial()
            throws Exception {
        RecordingRunner runner = new RecordingRunner(command -> success());
        ProcessProDockerEngine engine = engine(
                runner,
                (candidate, configuration) -> {
                    assertThat(configuration.resolve("config.json"))
                            .isRegularFile();
                    throw new ProModuleException(
                            "module_image_signature_invalid",
                            "Autark Pro rejected the agent image signature.");
                });
        RegistryCredential credential = credential(
                ProRuntimeTestFixtures.REPOSITORY,
                ProRuntimeTestFixtures.DIGEST);

        assertThatThrownBy(() -> engine.pullExact(
                        ProRuntimeTestFixtures.candidate(),
                        credential))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo("module_image_signature_invalid");
        try (var children = Files.list(
                layout().proRegistryPullRoot())) {
            assertThat(children).isEmpty();
        }
        credential.close();
    }

    @Test
    void startupDeletesCredentialMaterialLeftByAnInterruptedPull()
            throws Exception {
        Path pullRoot = layout().proRegistryPullRoot();
        Files.createDirectories(pullRoot);
        Files.setPosixFilePermissions(
                pullRoot.getParent(),
                java.util.Set.of(
                        java.nio.file.attribute.PosixFilePermission
                                .OWNER_READ,
                        java.nio.file.attribute.PosixFilePermission
                                .OWNER_WRITE,
                        java.nio.file.attribute.PosixFilePermission
                                .OWNER_EXECUTE));
        Files.setPosixFilePermissions(
                pullRoot,
                java.util.Set.of(
                        java.nio.file.attribute.PosixFilePermission
                                .OWNER_READ,
                        java.nio.file.attribute.PosixFilePermission
                                .OWNER_WRITE,
                        java.nio.file.attribute.PosixFilePermission
                                .OWNER_EXECUTE));
        Path stale = Files.createDirectory(
                pullRoot.resolve("pull-interrupted"));
        Files.writeString(
                stale.resolve("config.json"),
                "{\"registrytoken\":\"must-not-survive\"}");
        ProcessProDockerEngine engine = engine(
                new RecordingRunner(command -> success()));

        engine.cleanupRegistryCredentialsOnStartup();

        try (var children = Files.list(pullRoot)) {
            assertThat(children).isEmpty();
        }
    }

    @Test
    void localImageMustExposeTheExactAssignedRepoDigest() {
        RecordingRunner runner = new RecordingRunner(command ->
                command.contains("image")
                        ? success(
                                ProRuntimeTestFixtures.REPOSITORY
                                        + "@"
                                        + ProRuntimeTestFixtures.DIGEST)
                        : success());
        ProcessProDockerEngine engine = engine(runner);

        engine.verifyExactDigest(
                ProRuntimeTestFixtures.candidate());

        runner.responder = command -> success(
                ProRuntimeTestFixtures.REPOSITORY
                        + "@sha256:"
                        + "e".repeat(64));
        assertThatThrownBy(() -> engine.verifyExactDigest(
                        ProRuntimeTestFixtures.candidate()))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo("module_image_digest_mismatch");
    }

    @Test
    void startCreatesAndVerifiesAnInternalNetworkThenUsesPolicy()
            throws Exception {
        AtomicInteger networkInspections = new AtomicInteger();
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("network")
                    && command.contains("inspect")) {
                return networkInspections.getAndIncrement() == 0
                        ? failure()
                        : success("true|bridge|true");
            }
            if (command.contains("container")
                    && command.contains("inspect")) {
                return failure();
            }
            return success("container-id");
        });
        ProcessProDockerEngine engine = engine(runner);
        ProAgentApiCredentialStore secrets =
                new ProAgentApiCredentialStore(
                        layout().proAgentApiCredentialPath(),
                        new java.security.SecureRandom());
        Path secret = secrets.prepareMount();

        engine.startCandidate(
                ProRuntimeTestFixtures.candidate(),
                secret);

        assertThat(runner.commands)
                .anySatisfy(command -> assertThat(command)
                        .containsSubsequence(
                                "docker",
                                "network",
                                "create",
                                "--internal",
                                "--driver",
                                "bridge"))
                .anySatisfy(command -> assertThat(command)
                        .startsWith("docker", "run", "--detach")
                        .contains(
                                "--read-only",
                                "no-new-privileges=true",
                                "ALL")
                        .doesNotContain("--privileged", "--publish"));
    }

    @Test
    void foreignSameNamedResourcesAreNeverMutated() throws Exception {
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("network")
                    && command.contains("inspect")) {
                return success("true|bridge|true");
            }
            if (command.contains("container")
                    && command.contains("inspect")) {
                return success(
                        "false|autark-pro-agent|"
                                + ProRuntimeTestFixtures.DIGEST
                                + "|image|true");
            }
            return success();
        });
        ProcessProDockerEngine engine = engine(runner);
        Path secret = new ProAgentApiCredentialStore(
                layout().proAgentApiCredentialPath(),
                new java.security.SecureRandom())
                .prepareMount();

        assertThatThrownBy(() -> engine.startCandidate(
                        ProRuntimeTestFixtures.candidate(),
                        secret))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo("module_runtime_resource_conflict");
        assertThat(runner.commands)
                .noneMatch(command -> command.contains("rm"));
    }

    @Test
    void resolvesOnlyOwnedRunningCandidateOnPrivateNetwork() {
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("container")
                    && command.contains("inspect")) {
                String format = command.get(
                        command.indexOf("--format") + 1);
                if (format.contains("RestartCount")) {
                    return success("true|starting|0|0");
                }
                if (format.contains("NetworkSettings")) {
                    return success("172.19.0.2");
                }
                return success(
                        "true|autark-pro-agent|"
                                + ProRuntimeTestFixtures.DIGEST
                                + "|"
                                + ProRuntimeTestFixtures.REPOSITORY
                                + "@"
                                + ProRuntimeTestFixtures.DIGEST
                                + "|true");
            }
            return success();
        });
        ProcessProDockerEngine engine = engine(runner);

        assertThat(engine.candidateHealth(
                        ProRuntimeTestFixtures.candidate())
                .reasonCode()).isEqualTo(
                        "healthcheck_starting");
        assertThat(engine.candidateEndpoint(
                        ProRuntimeTestFixtures.candidate())
                .baseUri().toString()).isEqualTo(
                        "http://172.19.0.2:8080/");
    }

    @Test
    void activeRestartThresholdFailsAsCrashLoop() {
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("container")
                    && command.contains("inspect")) {
                String format = command.get(
                        command.indexOf("--format") + 1);
                if (format.contains("RestartCount")) {
                    return success("true|healthy|0|3");
                }
                return success(
                        "true|autark-pro-agent|"
                                + ProRuntimeTestFixtures.DIGEST
                                + "|"
                                + ProRuntimeTestFixtures.REPOSITORY
                                + "@"
                                + ProRuntimeTestFixtures.DIGEST
                                + "|true");
            }
            return success();
        });

        var health = engine(runner).activeHealth(
                ProRuntimeTestFixtures.DIGEST);

        assertThat(health.healthy()).isFalse();
        assertThat(health.reasonCode())
                .isEqualTo("container_crash_loop");
    }

    @Test
    void rejectsCandidateEndpointOutsidePrivateAddressSpace() {
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("container")
                    && command.contains("inspect")) {
                String format = command.get(
                        command.indexOf("--format") + 1);
                if (format.contains("NetworkSettings")) {
                    return success("8.8.8.8");
                }
                return success(
                        "true|autark-pro-agent|"
                                + ProRuntimeTestFixtures.DIGEST
                                + "|image|true");
            }
            return success();
        });

        assertThatThrownBy(() -> engine(runner)
                        .candidateEndpoint(
                                ProRuntimeTestFixtures
                                        .candidate()))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception)
                                .code())
                .isEqualTo(
                        "module_agent_endpoint_invalid");
    }

    @Test
    void cutoverRetainsOldActiveThenRenamesHealthyCandidate() {
        String candidateName =
                new ProContainerPolicy().candidateContainer(
                        ProRuntimeTestFixtures.DIGEST);
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("container")
                    && command.contains("inspect")) {
                String name = command.getLast();
                if (ProContainerPolicy.ROLLBACK_CONTAINER
                        .equals(name)) {
                    return failure();
                }
                String digest = candidateName.equals(name)
                        ? ProRuntimeTestFixtures.DIGEST
                        : ProRuntimeTestFixtures
                                .PREVIOUS_DIGEST;
                return success(
                        "true|autark-pro-agent|"
                                + digest
                                + "|image|true");
            }
            return success();
        });

        engine(runner).activateCandidate(
                ProRuntimeTestFixtures.candidate());

        assertThat(runner.commands)
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "stop",
                                "--time",
                                "15",
                                ProContainerPolicy
                                        .ACTIVE_CONTAINER))
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "rename",
                                ProContainerPolicy
                                        .ACTIVE_CONTAINER,
                                ProContainerPolicy
                                        .ROLLBACK_CONTAINER))
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "rename",
                                candidateName,
                                ProContainerPolicy
                                        .ACTIVE_CONTAINER))
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "update",
                                "--restart",
                                "unless-stopped",
                                ProContainerPolicy
                                        .ACTIVE_CONTAINER));
    }

    @Test
    void rollbackRemovesCutoverCandidateAndRestoresRetainedActive() {
        AtomicBoolean candidateIsActive =
                new AtomicBoolean(true);
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("container")
                    && command.contains("inspect")) {
                String name = command.getLast();
                if (ProContainerPolicy.ACTIVE_CONTAINER
                        .equals(name)) {
                    return candidateIsActive.get()
                            ? success(
                                    "true|autark-pro-agent|"
                                            + ProRuntimeTestFixtures
                                                    .DIGEST
                                            + "|image|true")
                            : failure();
                }
                if (ProContainerPolicy.ROLLBACK_CONTAINER
                        .equals(name)) {
                    return success(
                            "true|autark-pro-agent|"
                                    + ProRuntimeTestFixtures
                                            .PREVIOUS_DIGEST
                                    + "|image|false");
                }
                return failure();
            }
            if (command.contains("rm")
                    && command.contains(
                            ProContainerPolicy.ACTIVE_CONTAINER)) {
                candidateIsActive.set(false);
            }
            return success();
        });

        engine(runner).rollback(
                ProRuntimeTestFixtures.PREVIOUS_DIGEST,
                null,
                ProRuntimeTestFixtures.DIGEST);

        assertThat(runner.commands)
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "rm",
                                "--force",
                                ProContainerPolicy
                                        .ACTIVE_CONTAINER))
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "rename",
                                ProContainerPolicy
                                        .ROLLBACK_CONTAINER,
                                ProContainerPolicy
                                        .ACTIVE_CONTAINER))
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "start",
                                ProContainerPolicy
                                        .ACTIVE_CONTAINER));
    }

    @Test
    void expiredRollbackCleanupRequiresDistinctOwnedActiveGeneration() {
        String rollbackImage = ProRuntimeTestFixtures.REPOSITORY
                + "@"
                + ProRuntimeTestFixtures.PREVIOUS_DIGEST;
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("container")
                    && command.contains("inspect")) {
                String name = command.getLast();
                if (ProContainerPolicy.ACTIVE_CONTAINER
                        .equals(name)) {
                    return success(
                            "true|autark-pro-agent|"
                                    + ProRuntimeTestFixtures.DIGEST
                                    + "|active-image|true");
                }
                if (ProContainerPolicy.ROLLBACK_CONTAINER
                        .equals(name)) {
                    return success(
                            "true|autark-pro-agent|"
                                    + ProRuntimeTestFixtures
                                            .PREVIOUS_DIGEST
                                    + "|"
                                    + rollbackImage
                                    + "|false");
                }
            }
            return success();
        });

        engine(runner).discardPrevious(
                ProRuntimeTestFixtures.DIGEST,
                ProRuntimeTestFixtures.PREVIOUS_DIGEST);

        assertThat(runner.commands)
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "rm",
                                "--force",
                                ProContainerPolicy
                                        .ROLLBACK_CONTAINER))
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "image",
                                "rm",
                                rollbackImage));
    }

    @Test
    void removalTargetsOnlyLabeledProContainersImagesAndNetwork() {
        String activeImage = ProRuntimeTestFixtures.REPOSITORY
                + "@"
                + ProRuntimeTestFixtures.DIGEST;
        String rollbackImage = ProRuntimeTestFixtures.REPOSITORY
                + "@"
                + ProRuntimeTestFixtures.PREVIOUS_DIGEST;
        RecordingRunner runner = new RecordingRunner(command -> {
            if (command.contains("ps")) {
                return success(
                        ProContainerPolicy.ACTIVE_CONTAINER,
                        ProContainerPolicy.ROLLBACK_CONTAINER);
            }
            if (command.contains("container")
                    && command.contains("inspect")) {
                String name = command.getLast();
                boolean active = ProContainerPolicy.ACTIVE_CONTAINER
                        .equals(name);
                return success(
                        "true|autark-pro-agent|"
                                + (active
                                        ? ProRuntimeTestFixtures.DIGEST
                                        : ProRuntimeTestFixtures
                                                .PREVIOUS_DIGEST)
                                + "|"
                                + (active
                                        ? activeImage
                                        : rollbackImage)
                                + "|"
                                + active);
            }
            if (command.contains("network")
                    && command.contains("inspect")) {
                return success("true|bridge|true");
            }
            return success();
        });
        ProcessProDockerEngine engine = engine(runner);

        engine.remove(
                ProRuntimeTestFixtures.DIGEST,
                ProRuntimeTestFixtures.PREVIOUS_DIGEST);

        assertThat(runner.commands)
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "rm",
                                "--force",
                                ProContainerPolicy.ACTIVE_CONTAINER))
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "rm",
                                "--force",
                                ProContainerPolicy.ROLLBACK_CONTAINER))
                .anySatisfy(command -> assertThat(command)
                        .containsExactly(
                                "docker",
                                "network",
                                "rm",
                                ProContainerPolicy.INTERNAL_NETWORK));
        assertThat(runner.commands.toString())
                .doesNotContain("vaultwarden", "compose");
    }

    private ProcessProDockerEngine engine(
            RecordingRunner runner) {
        return engine(
                runner,
                (candidate, configuration) ->
                        assertThat(
                                configuration.resolve("config.json"))
                                .isRegularFile());
    }

    private ProcessProDockerEngine engine(
            RecordingRunner runner,
            ProImageSignatureVerifier verifier) {
        return new ProcessProDockerEngine(
                runner,
                layout(),
                new ProContainerPolicy(),
                verifier);
    }

    private RuntimeLayout layout() {
        AutarkOsRuntimeProperties properties =
                new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static RegistryCredential credential(
            String repository,
            String digest) throws Exception {
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
                TOKEN.toCharArray(),
                repository,
                digest,
                Instant.parse("2026-07-19T12:05:00Z"));
    }

    private static SystemCommandRunner.CommandExecutionResult success(
            String... output) {
        return new SystemCommandRunner.CommandExecutionResult(
                0,
                List.of(output),
                false);
    }

    private static SystemCommandRunner.CommandExecutionResult failure() {
        return new SystemCommandRunner.CommandExecutionResult(
                1,
                List.of("operation failed"),
                false);
    }

    private static final class RecordingRunner
            extends SystemCommandRunner {

        private final List<List<String>> commands =
                new ArrayList<>();
        private Function<List<String>, CommandExecutionResult> responder;

        private RecordingRunner(
                Function<List<String>, CommandExecutionResult> responder) {
            this.responder = responder;
        }

        @Override
        public CommandExecutionResult run(List<String> command) {
            List<String> copy = List.copyOf(command);
            commands.add(copy);
            return responder.apply(copy);
        }
    }
}
