package com.autarkos.pro.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.pro.module.ProModuleException;
import com.autarkos.system.SystemCommandRunner;

class ProcessCosignProImageSignatureVerifierTests {

    @TempDir
    Path directory;

    @Test
    void verifiesExactIndexWithWorkflowIdentityAndPrivateDockerConfig()
            throws Exception {
        Path configuration = configuration();
        RecordingRunner runner = new RecordingRunner(success());
        ProcessCosignProImageSignatureVerifier verifier = verifier(runner);

        verifier.verify(
                ProRuntimeTestFixtures.candidate(),
                configuration);

        assertThat(runner.command)
                .startsWith("cosign-pro115", "verify")
                .containsSubsequence(
                        "--certificate-identity",
                        "https://github.com/autark-labs/"
                                + "autark-os-pro-client/"
                                + ".github/workflows/release.yml"
                                + "@refs/tags/v1.2.3")
                .containsSubsequence(
                        "--certificate-oidc-issuer",
                        "https://token.actions.githubusercontent.com")
                .containsSubsequence(
                        "--certificate-github-workflow-repository",
                        "autark-labs/autark-os-pro-client")
                .containsSubsequence(
                        "--certificate-github-workflow-ref",
                        "refs/tags/v1.2.3")
                .contains(
                        "autark.component=autark-pro-agent",
                        "autark.version=1.2.3",
                        "autark.release-channel=staging",
                        "autark.subject=index")
                .endsWith(
                        ProRuntimeTestFixtures.REPOSITORY
                                + "@"
                                + ProRuntimeTestFixtures.DIGEST);
        assertThat(runner.environment)
                .containsOnlyKeys("DOCKER_CONFIG")
                .containsEntry(
                        "DOCKER_CONFIG",
                        configuration.toAbsolutePath()
                                .normalize().toString());
        assertThat(runner.command.toString())
                .doesNotContain("registrytoken", "aaa.bbb.ccc");
        assertThat(runner.timeout).isEqualTo(Duration.ofSeconds(45));
    }

    @Test
    void signatureMismatchAndMissingVerifierFailClosed()
            throws Exception {
        Path configuration = configuration();
        RecordingRunner mismatch = new RecordingRunner(
                new SystemCommandRunner.CommandExecutionResult(
                        1,
                        List.of("no matching signatures"),
                        false));
        RecordingRunner missing = new RecordingRunner(
                new SystemCommandRunner.CommandExecutionResult(
                        127,
                        List.of("not found"),
                        true));

        assertThatThrownBy(() -> verifier(mismatch).verify(
                        ProRuntimeTestFixtures.candidate(),
                        configuration))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo("module_image_signature_invalid");
        assertThatThrownBy(() -> verifier(missing).verify(
                        ProRuntimeTestFixtures.candidate(),
                        configuration))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo(
                        "module_image_signature_verifier_unavailable");
    }

    @Test
    void missingOrSymlinkedDockerCredentialConfigurationFailsBeforeCosign()
            throws Exception {
        RecordingRunner runner = new RecordingRunner(success());
        Path missing = directory.resolve("missing");
        Path target = configuration();
        Path link = directory.resolve("config-link");
        Files.createSymbolicLink(link, target);

        assertThatThrownBy(() -> verifier(runner).verify(
                        ProRuntimeTestFixtures.candidate(),
                        missing))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo(
                        "module_image_signature_verification_failed");
        assertThatThrownBy(() -> verifier(runner).verify(
                        ProRuntimeTestFixtures.candidate(),
                        link))
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo(
                        "module_image_signature_verification_failed");
        assertThat(runner.command).isEmpty();
    }

    private Path configuration() throws Exception {
        Path configuration = Files.createDirectory(
                directory.resolve("docker-" + System.nanoTime()));
        Files.writeString(
                configuration.resolve("config.json"),
                "{\"auths\":{}}");
        return configuration;
    }

    private static ProcessCosignProImageSignatureVerifier verifier(
            RecordingRunner runner) {
        return new ProcessCosignProImageSignatureVerifier(
                runner,
                new ClasspathProImageSignatureTrustPolicy(),
                "cosign-pro115");
    }

    private static SystemCommandRunner.CommandExecutionResult success() {
        return new SystemCommandRunner.CommandExecutionResult(
                0,
                List.of("{}"),
                false);
    }

    private static final class RecordingRunner
            extends SystemCommandRunner {

        private final CommandExecutionResult result;
        private List<String> command = new ArrayList<>();
        private Map<String, String> environment = Map.of();
        private Duration timeout;

        private RecordingRunner(CommandExecutionResult result) {
            this.result = result;
        }

        @Override
        public CommandExecutionResult run(
                List<String> value,
                Map<String, String> environmentValue,
                Duration timeoutValue,
                String timeoutMessage,
                String interruptedMessage) {
            command = List.copyOf(value);
            environment = Map.copyOf(environmentValue);
            timeout = timeoutValue;
            return result;
        }
    }
}
