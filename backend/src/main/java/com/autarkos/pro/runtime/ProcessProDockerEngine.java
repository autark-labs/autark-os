package com.autarkos.pro.runtime;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.agent.ProAgentEndpoint;
import com.autarkos.pro.module.ProModuleCandidate;
import com.autarkos.pro.module.ProModuleException;
import com.autarkos.pro.module.ProModuleRuntime;
import com.autarkos.pro.registry.RegistryCredential;
import com.autarkos.system.SystemCommandRunner;

@Component
public class ProcessProDockerEngine implements ProDockerEngine {

    private static final Set<PosixFilePermission> PRIVATE_DIRECTORY =
            Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE,
                    PosixFilePermission.OWNER_EXECUTE);
    private static final Set<PosixFilePermission> PRIVATE_FILE =
            Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE);
    private static final String NETWORK_FORMAT =
            "{{.Internal}}|{{.Driver}}|"
                    + "{{index .Labels \"com.autarkos.pro.managed\"}}";
    private static final String CONTAINER_FORMAT =
            "{{index .Config.Labels \"com.autarkos.pro.managed\"}}|"
                    + "{{index .Config.Labels \"com.autarkos.pro.component\"}}|"
                    + "{{index .Config.Labels \"com.autarkos.pro.digest\"}}|"
                    + "{{index .Config.Labels \"com.autarkos.pro.image\"}}|"
                    + "{{.State.Running}}";
    private static final String HEALTH_FORMAT =
            "{{.State.Running}}|"
                    + "{{if .State.Health}}"
                    + "{{.State.Health.Status}}"
                    + "{{else}}none{{end}}|"
                    + "{{.State.ExitCode}}|"
                    + "{{.RestartCount}}";
    private static final String ENDPOINT_FORMAT =
            "{{with index .NetworkSettings.Networks \""
                    + ProContainerPolicy.INTERNAL_NETWORK
                    + "\"}}{{.IPAddress}}{{end}}";
    private static final int CRASH_LOOP_RESTARTS = 3;

    private final SystemCommandRunner commandRunner;
    private final RuntimeLayout runtimeLayout;
    private final ProContainerPolicy policy;
    private final ProImageSignatureVerifier imageSignatureVerifier;

    public ProcessProDockerEngine(
            SystemCommandRunner commandRunner,
            RuntimeLayout runtimeLayout,
            ProContainerPolicy policy,
            ProImageSignatureVerifier imageSignatureVerifier) {
        this.commandRunner = Objects.requireNonNull(commandRunner);
        this.runtimeLayout = Objects.requireNonNull(runtimeLayout);
        this.policy = Objects.requireNonNull(policy);
        this.imageSignatureVerifier = Objects.requireNonNull(
                imageSignatureVerifier);
    }

    @EventListener(ApplicationReadyEvent.class)
    public synchronized void cleanupRegistryCredentialsOnStartup() {
        Path pullRoot = runtimeLayout.proRegistryPullRoot()
                .toAbsolutePath()
                .normalize();
        if (!Files.exists(pullRoot, LinkOption.NOFOLLOW_LINKS)) {
            return;
        }
        try {
            ensurePrivateDirectory(pullRoot);
            try (DirectoryStream<Path> entries =
                    Files.newDirectoryStream(pullRoot)) {
                for (Path entry : entries) {
                    deleteTree(entry, pullRoot);
                }
            }
        } catch (IOException | RuntimeException ignored) {
            // Optional Pro cleanup must not block CE startup or login.
        }
    }

    @Override
    public synchronized void pullExact(
            ProModuleCandidate candidate,
            RegistryCredential credential) {
        String image = policy.image(candidate);
        requireCredential(candidate, credential);
        Path pullRoot = runtimeLayout.proRegistryPullRoot()
                .toAbsolutePath()
                .normalize();
        Path temporary = null;
        try {
            preparePullRoot(pullRoot);
            temporary = Files.createTempDirectory(
                    pullRoot,
                    "pull-");
            Files.setPosixFilePermissions(
                    temporary,
                    PRIVATE_DIRECTORY);
            Path configuration = temporary.resolve("config.json");
            Path finalTemporary = temporary;
            credential.useSecret(secret -> {
                writeRegistryConfiguration(
                        configuration,
                        registryAuthority(
                                candidate.manifest().repository()),
                        secret);
                return null;
            });
            runRequired(
                    List.of(
                            "docker",
                            "--config",
                            finalTemporary.toString(),
                            "pull",
                            image),
                    "module_image_pull_failed",
                    "Autark Pro could not pull the exact assigned image.");
            imageSignatureVerifier.verify(
                    candidate,
                    finalTemporary);
        } catch (IOException exception) {
            throw new ProModuleException(
                    "module_registry_configuration_failed",
                    "Autark Pro could not prepare registry authentication.",
                    exception);
        } finally {
            cleanupPullDirectory(temporary);
        }
    }

    @Override
    public synchronized void verifyExactDigest(
            ProModuleCandidate candidate) {
        String image = policy.image(candidate);
        SystemCommandRunner.CommandExecutionResult result =
                runRequired(
                        List.of(
                                "docker",
                                "image",
                                "inspect",
                                "--format",
                                "{{range .RepoDigests}}"
                                        + "{{println .}}{{end}}",
                                image),
                        "module_image_verification_failed",
                        "Autark Pro could not verify the local image.");
        boolean exact = result.outputLines().stream()
                .map(String::trim)
                .anyMatch(image::equals);
        if (!exact) {
            throw new ProModuleException(
                    "module_image_digest_mismatch",
                    "Autark Pro local image did not match the assigned digest.");
        }
    }

    @Override
    public synchronized void startCandidate(
            ProModuleCandidate candidate,
            Path apiCredentialPath) {
        policy.image(candidate);
        requireCredentialPath(apiCredentialPath);
        ensureInternalNetwork();
        String digest = candidate.manifest().digest();
        removeOwned(
                policy.candidateContainer(digest),
                digest,
                false);
        runRequired(
                policy.runCommand(candidate, apiCredentialPath),
                "module_candidate_start_failed",
                "Autark Pro candidate could not start.");
    }

    @Override
    public synchronized ProModuleRuntime.HealthResult candidateHealth(
            ProModuleCandidate candidate) {
        policy.image(candidate);
        String name = policy.candidateContainer(
                candidate.manifest().digest());
        return containerHealth(
                name,
                candidate.manifest().digest(),
                false);
    }

    @Override
    public synchronized ProAgentEndpoint candidateEndpoint(
            ProModuleCandidate candidate) {
        policy.image(candidate);
        return endpoint(
                policy.candidateContainer(
                        candidate.manifest().digest()),
                candidate.manifest().digest());
    }

    @Override
    public synchronized ProModuleRuntime.HealthResult activeHealth(
            String activeDigest) {
        policy.requireDigest(activeDigest);
        return containerHealth(
                ProContainerPolicy.ACTIVE_CONTAINER,
                activeDigest,
                true);
    }

    @Override
    public synchronized ProAgentEndpoint activeEndpoint(
            String activeDigest) {
        policy.requireDigest(activeDigest);
        return endpoint(
                ProContainerPolicy.ACTIVE_CONTAINER,
                activeDigest);
    }

    private ProModuleRuntime.HealthResult containerHealth(
            String name,
            String expectedDigest,
            boolean detectCrashLoop) {
        requireOwned(name, expectedDigest);
        SystemCommandRunner.CommandExecutionResult result =
                runRequired(
                        List.of(
                                "docker",
                                "container",
                                "inspect",
                                "--format",
                                HEALTH_FORMAT,
                                name),
                        "module_health_inspection_failed",
                        "Autark Pro candidate health is unavailable.");
        String[] fields = oneLine(result).split("\\|", -1);
        if (fields.length != 4) {
            return new ProModuleRuntime.HealthResult(
                    false,
                    "healthcheck_unavailable");
        }
        int restartCount;
        try {
            restartCount = Integer.parseInt(fields[3]);
        } catch (NumberFormatException exception) {
            return new ProModuleRuntime.HealthResult(
                    false,
                    "healthcheck_unavailable");
        }
        if (detectCrashLoop
                && restartCount >= CRASH_LOOP_RESTARTS) {
            return new ProModuleRuntime.HealthResult(
                    false,
                    "container_crash_loop");
        }
        if (!"true".equals(fields[0])) {
            return new ProModuleRuntime.HealthResult(
                    false,
                    "container_not_running");
        }
        return switch (fields[1]) {
            case "healthy" -> new ProModuleRuntime.HealthResult(
                    true,
                    "healthy");
            case "starting" -> new ProModuleRuntime.HealthResult(
                    false,
                    "healthcheck_starting");
            case "unhealthy" -> new ProModuleRuntime.HealthResult(
                    false,
                    "healthcheck_failed");
            default -> new ProModuleRuntime.HealthResult(
                    false,
                    "healthcheck_unavailable");
        };
    }

    private ProAgentEndpoint endpoint(
            String name,
            String expectedDigest) {
        ContainerInfo info = requireOwned(name, expectedDigest);
        if (!info.running()) {
            throw new ProModuleException(
                    "module_agent_unavailable",
                    "Autark Pro agent is unavailable.");
        }
        SystemCommandRunner.CommandExecutionResult result =
                runRequired(
                        List.of(
                                "docker",
                                "container",
                                "inspect",
                                "--format",
                                ENDPOINT_FORMAT,
                                name),
                        "module_agent_endpoint_unavailable",
                        "Autark Pro agent endpoint is unavailable.");
        try {
            return ProAgentEndpoint.forAddress(
                    oneLine(result),
                    expectedDigest);
        } catch (IllegalArgumentException exception) {
            throw new ProModuleException(
                    "module_agent_endpoint_invalid",
                    "Autark Pro agent endpoint is invalid.",
                    exception);
        }
    }

    @Override
    public synchronized void activateCandidate(
            ProModuleCandidate candidate) {
        policy.image(candidate);
        String digest = candidate.manifest().digest();
        String candidateName = policy.candidateContainer(digest);
        ContainerInfo active = inspectOwned(
                ProContainerPolicy.ACTIVE_CONTAINER);
        if (active != null && digest.equals(active.digest())) {
            removeOwned(candidateName, digest, false);
            ensureRestartPolicy();
            return;
        }
        requireOwned(candidateName, digest);
        removeOwned(
                ProContainerPolicy.ROLLBACK_CONTAINER,
                null,
                false);
        if (active != null) {
            if (active.running()) {
                runRequired(
                        List.of(
                                "docker",
                                "stop",
                                "--time",
                                "15",
                                ProContainerPolicy.ACTIVE_CONTAINER),
                        "module_cutover_failed",
                        "Autark Pro could not stop the previous runtime.");
            }
            runRequired(
                    List.of(
                            "docker",
                            "rename",
                            ProContainerPolicy.ACTIVE_CONTAINER,
                            ProContainerPolicy.ROLLBACK_CONTAINER),
                    "module_cutover_failed",
                    "Autark Pro could not retain the previous runtime.");
        }
        runRequired(
                List.of(
                        "docker",
                        "rename",
                        candidateName,
                        ProContainerPolicy.ACTIVE_CONTAINER),
                "module_cutover_failed",
                "Autark Pro could not activate the verified candidate.");
        ensureRestartPolicy();
    }

    @Override
    public synchronized void discardCandidate(
            String candidateDigest) {
        policy.requireDigest(candidateDigest);
        removeOwned(
                policy.candidateContainer(candidateDigest),
                candidateDigest,
                false);
    }

    @Override
    public synchronized void discardPrevious(
            String activeDigest,
            String previousDigest) {
        policy.requireDigest(activeDigest);
        policy.requireDigest(previousDigest);
        if (activeDigest.equals(previousDigest)) {
            throw resourceConflict();
        }
        requireOwned(
                ProContainerPolicy.ACTIVE_CONTAINER,
                activeDigest);
        ContainerInfo retained = inspectOwned(
                ProContainerPolicy.ROLLBACK_CONTAINER);
        if (retained == null) {
            return;
        }
        if (!previousDigest.equals(retained.digest())) {
            throw resourceConflict();
        }
        String image = retained.image();
        removeOwned(
                ProContainerPolicy.ROLLBACK_CONTAINER,
                previousDigest,
                true);
        if (image != null && !image.isBlank()) {
            run(List.of("docker", "image", "rm", image));
        }
    }

    @Override
    public synchronized void rollback(
            String activeDigest,
            String previousDigest,
            String candidateDigest) {
        policy.requireOptionalDigest(activeDigest);
        policy.requireOptionalDigest(previousDigest);
        policy.requireOptionalDigest(candidateDigest);

        ContainerInfo active = inspectOwned(
                ProContainerPolicy.ACTIVE_CONTAINER);
        if (active != null
                && candidateDigest != null
                && candidateDigest.equals(active.digest())) {
            removeOwned(
                    ProContainerPolicy.ACTIVE_CONTAINER,
                    candidateDigest,
                    true);
            active = null;
        }
        if (candidateDigest != null) {
            removeOwned(
                    policy.candidateContainer(candidateDigest),
                    candidateDigest,
                    false);
        }
        if (activeDigest == null) {
            removeOwned(
                    ProContainerPolicy.ROLLBACK_CONTAINER,
                    null,
                    false);
            return;
        }
        active = inspectOwned(ProContainerPolicy.ACTIVE_CONTAINER);
        if (active != null) {
            if (!activeDigest.equals(active.digest())) {
                throw resourceConflict();
            }
            startIfStopped(
                    ProContainerPolicy.ACTIVE_CONTAINER,
                    active);
            return;
        }
        ContainerInfo retained = requireOwned(
                ProContainerPolicy.ROLLBACK_CONTAINER,
                activeDigest);
        runRequired(
                List.of(
                        "docker",
                        "rename",
                        ProContainerPolicy.ROLLBACK_CONTAINER,
                        ProContainerPolicy.ACTIVE_CONTAINER),
                "module_rollback_failed",
                "Autark Pro could not restore the retained runtime.");
        startIfStopped(
                ProContainerPolicy.ACTIVE_CONTAINER,
                retained);
        ensureRestartPolicy();
    }

    @Override
    public synchronized void remove(
            String activeDigest,
            String previousDigest) {
        policy.requireOptionalDigest(activeDigest);
        policy.requireOptionalDigest(previousDigest);
        List<ContainerInfo> containers = managedContainers();
        List<String> images = new ArrayList<>();
        for (ContainerInfo container : containers) {
            if (!allowedManagedName(container.name())) {
                throw resourceConflict();
            }
            if (container.image() != null
                    && !container.image().isBlank()) {
                images.add(container.image());
            }
            removeOwned(container.name(), container.digest(), true);
        }
        for (String image : images.stream().distinct().toList()) {
            runRequired(
                    List.of("docker", "image", "rm", image),
                    "module_image_cleanup_failed",
                    "Autark Pro could not remove a retained agent image.");
        }
        removeInternalNetwork();
    }

    private void preparePullRoot(Path pullRoot) throws IOException {
        ensurePrivateDirectory(
                runtimeLayout.proAgentRoot()
                        .toAbsolutePath()
                        .normalize());
        ensurePrivateDirectory(pullRoot);
        try (DirectoryStream<Path> entries =
                Files.newDirectoryStream(pullRoot)) {
            for (Path entry : entries) {
                deleteTree(entry, pullRoot);
            }
        }
    }

    private static void writeRegistryConfiguration(
            Path configuration,
            String authority,
            char[] secret) throws IOException {
        Files.createFile(configuration);
        Files.setPosixFilePermissions(
                configuration,
                PRIVATE_FILE);
        try (BufferedWriter writer = Files.newBufferedWriter(
                configuration,
                StandardCharsets.US_ASCII,
                StandardOpenOption.TRUNCATE_EXISTING,
                StandardOpenOption.WRITE)) {
            writer.write("{\"auths\":{\"");
            writer.write(authority);
            writer.write("\":{\"registrytoken\":\"");
            writer.write(secret);
            writer.write("\"}}}");
        }
    }

    private void ensureInternalNetwork() {
        SystemCommandRunner.CommandExecutionResult inspect =
                run(List.of(
                        "docker",
                        "network",
                        "inspect",
                        "--format",
                        NETWORK_FORMAT,
                        ProContainerPolicy.INTERNAL_NETWORK));
        if (!inspect.successful()) {
            runRequired(
                    List.of(
                            "docker",
                            "network",
                            "create",
                            "--internal",
                            "--driver",
                            "bridge",
                            "--label",
                            ProContainerPolicy.MANAGED_LABEL + "=true",
                            ProContainerPolicy.INTERNAL_NETWORK),
                    "module_network_failed",
                    "Autark Pro internal network could not be created.");
            inspect = runRequired(
                    List.of(
                            "docker",
                            "network",
                            "inspect",
                            "--format",
                            NETWORK_FORMAT,
                            ProContainerPolicy.INTERNAL_NETWORK),
                    "module_network_failed",
                    "Autark Pro internal network could not be verified.");
        }
        if (!"true|bridge|true".equals(oneLine(inspect))) {
            throw resourceConflict();
        }
    }

    private void removeInternalNetwork() {
        SystemCommandRunner.CommandExecutionResult inspect =
                run(List.of(
                        "docker",
                        "network",
                        "inspect",
                        "--format",
                        NETWORK_FORMAT,
                        ProContainerPolicy.INTERNAL_NETWORK));
        if (!inspect.successful()) {
            return;
        }
        if (!"true|bridge|true".equals(oneLine(inspect))) {
            throw resourceConflict();
        }
        runRequired(
                List.of(
                        "docker",
                        "network",
                        "rm",
                        ProContainerPolicy.INTERNAL_NETWORK),
                "module_network_cleanup_failed",
                "Autark Pro internal network could not be removed.");
    }

    private List<ContainerInfo> managedContainers() {
        SystemCommandRunner.CommandExecutionResult result =
                runRequired(
                        List.of(
                                "docker",
                                "ps",
                                "--all",
                                "--filter",
                                "label=" + ProContainerPolicy.MANAGED_LABEL
                                        + "=true",
                                "--filter",
                                "label=" + ProContainerPolicy.COMPONENT_LABEL
                                        + "=" + ProContainerPolicy.COMPONENT,
                                "--format",
                                "{{.Names}}"),
                        "module_runtime_inspection_failed",
                        "Autark Pro runtime resources could not be inspected.");
        return result.outputLines().stream()
                .map(String::trim)
                .filter(name -> !name.isBlank())
                .map(this::requireOwned)
                .toList();
    }

    private ContainerInfo requireOwned(String name) {
        ContainerInfo info = inspectOwned(name);
        if (info == null) {
            throw resourceConflict();
        }
        return info;
    }

    private ContainerInfo requireOwned(
            String name,
            String expectedDigest) {
        ContainerInfo info = requireOwned(name);
        if (!expectedDigest.equals(info.digest())) {
            throw resourceConflict();
        }
        return info;
    }

    private ContainerInfo inspectOwned(String name) {
        SystemCommandRunner.CommandExecutionResult result =
                run(List.of(
                        "docker",
                        "container",
                        "inspect",
                        "--format",
                        CONTAINER_FORMAT,
                        name));
        if (!result.successful()) {
            return null;
        }
        String[] fields = oneLine(result).split("\\|", -1);
        if (fields.length != 5
                || !"true".equals(fields[0])
                || !ProContainerPolicy.COMPONENT.equals(fields[1])) {
            throw resourceConflict();
        }
        policy.requireDigest(fields[2]);
        return new ContainerInfo(
                name,
                fields[2],
                fields[3],
                Boolean.parseBoolean(fields[4]));
    }

    private void removeOwned(
            String name,
            String expectedDigest,
            boolean required) {
        ContainerInfo info = inspectOwned(name);
        if (info == null) {
            if (required) {
                throw resourceConflict();
            }
            return;
        }
        if (expectedDigest != null
                && !expectedDigest.equals(info.digest())) {
            throw resourceConflict();
        }
        runRequired(
                List.of("docker", "rm", "--force", name),
                "module_container_cleanup_failed",
                "Autark Pro could not remove an owned agent container.");
    }

    private void startIfStopped(
            String name,
            ContainerInfo info) {
        if (info.running()) {
            return;
        }
        runRequired(
                List.of("docker", "start", name),
                "module_rollback_failed",
                "Autark Pro could not restart the retained runtime.");
    }

    private void ensureRestartPolicy() {
        runRequired(
                List.of(
                        "docker",
                        "update",
                        "--restart",
                        "unless-stopped",
                        ProContainerPolicy.ACTIVE_CONTAINER),
                "module_cutover_failed",
                "Autark Pro could not set the active restart policy.");
    }

    private void requireCredentialPath(Path credentialPath) {
        Path expected = runtimeLayout.proAgentApiCredentialPath()
                .toAbsolutePath()
                .normalize();
        Path candidate = credentialPath == null
                ? null
                : credentialPath.toAbsolutePath().normalize();
        if (!expected.equals(candidate)
                || Files.isSymbolicLink(expected)
                || !Files.isRegularFile(
                        expected,
                        LinkOption.NOFOLLOW_LINKS)) {
            throw new ProModuleException(
                    "agent_credential_unavailable",
                    "Autark Pro local API credential is unavailable.");
        }
    }

    private static void requireCredential(
            ProModuleCandidate candidate,
            RegistryCredential credential) {
        if (credential == null
                || !constantEquals(
                        candidate.manifest().repository(),
                        credential.repository())
                || !constantEquals(
                        candidate.manifest().digest(),
                        credential.digest())) {
            throw new ProModuleException(
                    "invalid_registry_credential",
                    "Registry credential did not match the assigned image.");
        }
    }

    private SystemCommandRunner.CommandExecutionResult runRequired(
            List<String> command,
            String code,
            String message) {
        SystemCommandRunner.CommandExecutionResult result = run(command);
        if (!result.successful()) {
            throw new ProModuleException(code, message);
        }
        return result;
    }

    private SystemCommandRunner.CommandExecutionResult run(
            List<String> command) {
        SystemCommandRunner.CommandExecutionResult result =
                commandRunner.run(List.copyOf(command));
        if (result.missingCommand()) {
            throw new ProModuleException(
                    "module_runtime_unavailable",
                    "Docker is unavailable for the Autark Pro module.");
        }
        return result;
    }

    private void cleanupPullDirectory(Path temporary) {
        if (temporary == null) {
            return;
        }
        try {
            deleteTree(
                    temporary,
                    runtimeLayout.proRegistryPullRoot()
                            .toAbsolutePath()
                            .normalize());
        } catch (IOException exception) {
            throw new ProModuleException(
                    "module_registry_cleanup_failed",
                    "Autark Pro registry credentials could not be removed.",
                    exception);
        }
    }

    private static void ensurePrivateDirectory(Path directory)
            throws IOException {
        if (Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) {
            if (Files.isSymbolicLink(directory)
                    || !Files.isDirectory(
                            directory,
                            LinkOption.NOFOLLOW_LINKS)
                    || !PRIVATE_DIRECTORY.equals(
                            Files.getPosixFilePermissions(
                                    directory,
                                    LinkOption.NOFOLLOW_LINKS))) {
                throw new IOException("unsafe runtime directory");
            }
            return;
        }
        Files.createDirectory(directory);
        Files.setPosixFilePermissions(directory, PRIVATE_DIRECTORY);
    }

    private static void deleteTree(Path path, Path allowedRoot)
            throws IOException {
        Path normalized = path.toAbsolutePath().normalize();
        if (!normalized.startsWith(allowedRoot)
                || normalized.equals(allowedRoot)) {
            throw new IOException("unsafe cleanup path");
        }
        if (Files.isDirectory(
                        normalized,
                        LinkOption.NOFOLLOW_LINKS)
                && !Files.isSymbolicLink(normalized)) {
            try (DirectoryStream<Path> children =
                    Files.newDirectoryStream(normalized)) {
                for (Path child : children) {
                    deleteTree(child, allowedRoot);
                }
            }
        }
        Files.deleteIfExists(normalized);
    }

    private static boolean allowedManagedName(String name) {
        return ProContainerPolicy.ACTIVE_CONTAINER.equals(name)
                || ProContainerPolicy.ROLLBACK_CONTAINER.equals(name)
                || name != null
                        && name.startsWith(
                                "autark-pro-agent-candidate-");
    }

    private static String registryAuthority(String repository) {
        int slash = repository.indexOf('/');
        if (slash < 1) {
            throw new ProModuleException(
                    "invalid_agent_runtime_policy",
                    "Autark Pro agent runtime policy is invalid.");
        }
        return repository.substring(0, slash);
    }

    private static String oneLine(
            SystemCommandRunner.CommandExecutionResult result) {
        return result.outputLines().stream()
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .findFirst()
                .orElse("");
    }

    private static boolean constantEquals(
            String left,
            String right) {
        if (left == null || right == null) {
            return false;
        }
        return MessageDigest.isEqual(
                left.getBytes(StandardCharsets.US_ASCII),
                right.getBytes(StandardCharsets.US_ASCII));
    }

    private static ProModuleException resourceConflict() {
        return new ProModuleException(
                "module_runtime_resource_conflict",
                "Autark Pro found a runtime resource it does not own.");
    }

    private record ContainerInfo(
            String name,
            String digest,
            String image,
            boolean running) {
    }
}
