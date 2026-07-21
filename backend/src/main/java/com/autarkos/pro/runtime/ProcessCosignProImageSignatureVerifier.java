package com.autarkos.pro.runtime;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.autarkos.pro.module.ProModuleCandidate;
import com.autarkos.pro.module.ProModuleException;
import com.autarkos.system.SystemCommandRunner;

@Component
public class ProcessCosignProImageSignatureVerifier
        implements ProImageSignatureVerifier {

    private static final Duration TIMEOUT = Duration.ofSeconds(45);

    private final SystemCommandRunner commandRunner;
    private final ProImageSignatureTrustPolicy trustPolicy;
    private final String executable;

    public ProcessCosignProImageSignatureVerifier(
            SystemCommandRunner commandRunner,
            ProImageSignatureTrustPolicy trustPolicy,
            @Value(
                    "${autark.pro.cosign-executable:"
                            + "${AUTARK_OS_COSIGN_EXECUTABLE:"
                            + "/opt/autark-os/bin/cosign}}")
                    String executable) {
        this.commandRunner = Objects.requireNonNull(commandRunner);
        this.trustPolicy = Objects.requireNonNull(trustPolicy);
        this.executable = requireExecutable(executable);
    }

    @Override
    public void verify(
            ProModuleCandidate candidate,
            Path dockerConfigurationDirectory) {
        Objects.requireNonNull(candidate);
        Path configuration = requireConfiguration(
                dockerConfigurationDirectory);
        List<String> command = new ArrayList<>();
        command.add(executable);
        command.add("verify");
        command.addAll(trustPolicy.verificationArguments(
                candidate.manifest()));
        command.add("--output");
        command.add("json");
        command.add(candidate.manifest().repository()
                + "@"
                + candidate.manifest().digest());

        SystemCommandRunner.CommandExecutionResult result =
                commandRunner.run(
                        List.copyOf(command),
                        Map.of(
                                "DOCKER_CONFIG",
                                configuration.toString()),
                        TIMEOUT,
                        "Autark Pro image signature verification timed out.",
                        "Autark Pro image signature verification was interrupted.");
        if (result.missingCommand()) {
            throw new ProModuleException(
                    "module_image_signature_verifier_unavailable",
                    "Autark Pro image signature verification is unavailable.");
        }
        if (!result.successful()) {
            throw new ProModuleException(
                    "module_image_signature_invalid",
                    "Autark Pro rejected the agent image signature.");
        }
    }

    private static Path requireConfiguration(Path value) {
        Path normalized = value == null
                ? null
                : value.toAbsolutePath().normalize();
        if (normalized == null
                || Files.isSymbolicLink(normalized)
                || !Files.isDirectory(
                        normalized,
                        LinkOption.NOFOLLOW_LINKS)
                || Files.isSymbolicLink(
                        normalized.resolve("config.json"))
                || !Files.isRegularFile(
                        normalized.resolve("config.json"),
                        LinkOption.NOFOLLOW_LINKS)) {
            throw new ProModuleException(
                    "module_image_signature_verification_failed",
                    "Autark Pro could not prepare image signature verification.");
        }
        return normalized;
    }

    private static String requireExecutable(String value) {
        if (value == null
                || value.isBlank()
                || value.length() > 4096
                || value.indexOf('\0') >= 0) {
            throw new IllegalArgumentException(
                    "Cosign executable is invalid.");
        }
        return value;
    }
}
