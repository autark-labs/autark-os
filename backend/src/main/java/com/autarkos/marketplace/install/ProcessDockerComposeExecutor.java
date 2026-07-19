package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.system.SystemCommandRunner;

@Component
public class ProcessDockerComposeExecutor implements DockerComposeExecutor {

    private static final Pattern FIELD_PATTERN = Pattern.compile("\"%s\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");
    private final SystemCommandRunner commandRunner;

    public ProcessDockerComposeExecutor(SystemCommandRunner commandRunner) {
        this.commandRunner = commandRunner;
    }

    @Override
    public RuntimeModels.DockerComposeResult up(Path composeFile, String projectName) {
        return run(composeFile, projectName, "up", "-d");
    }

    @Override
    public RuntimeModels.DockerComposeResult pull(Path composeFile, String projectName) {
        return run(composeFile, projectName, "pull");
    }

    @Override
    public Map<String, String> imageDigests(List<String> images) {
        Map<String, String> resolved = new LinkedHashMap<>();
        for (String image : images == null ? List.<String>of() : images) {
            if (image == null || image.isBlank()) {
                continue;
            }
            RuntimeModels.DockerComposeResult result = runCommand(List.of(
                    "docker", "image", "inspect", "--format", "{{join .RepoDigests \"\\n\"}}", image));
            if (!result.successful()) {
                continue;
            }
            String digest = result.output().stream()
                    .map(String::trim)
                    .filter(value -> value.contains("@sha256:"))
                    .findFirst()
                    .orElse("");
            if (!digest.isBlank()) {
                resolved.put(image, digest);
            }
        }
        return resolved;
    }

    @Override
    public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
        return run(composeFile, projectName, "stop");
    }

    @Override
    public RuntimeModels.DockerComposeResult stopManagedProject(Path composeFile, String projectName, String appId) {
        if (Files.isRegularFile(composeFile)) {
            return stop(composeFile, projectName);
        }
        ContainerSelection selection = managedContainerIds(projectName, appId);
        if (!selection.successful()) {
            return new RuntimeModels.DockerComposeResult(selection.exitCode(), selection.output());
        }
        if (selection.containerIds().isEmpty()) {
            return new RuntimeModels.DockerComposeResult(0, List.of("No matching managed containers were found."));
        }
        List<String> command = new ArrayList<>(List.of("docker", "stop"));
        command.addAll(selection.containerIds());
        return runCommand(command);
    }

    @Override
    public RuntimeModels.DockerComposeResult restart(Path composeFile, String projectName) {
        return run(composeFile, projectName, "restart");
    }

    @Override
    public RuntimeModels.DockerComposeResult down(Path composeFile, String projectName) {
        return run(composeFile, projectName, "down");
    }

    @Override
    public RuntimeModels.DockerComposeResult ps(Path composeFile, String projectName) {
        return run(composeFile, projectName, "ps", "--all");
    }

    @Override
    public List<RuntimeModels.DockerContainerStatus> containers(Path composeFile, String projectName) {
        RuntimeModels.DockerComposeResult result = run(composeFile, projectName, "ps", "--all", "--format", "json");
        if (!result.successful() || result.output().isEmpty()) {
            return List.of();
        }
        return parseContainers(result.output());
    }

    @Override
    public List<RuntimeModels.DockerContainerStatus> containersForApp(Path composeFile, String projectName, String appId) {
        if (Files.isRegularFile(composeFile)) {
            return containers(composeFile, projectName);
        }
        List<String> command = managedDockerCommand("ps", "-a", projectName, appId);
        command.addAll(List.of("--format", "{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Ports}}\t{{.Label \"com.docker.compose.service\"}}"));
        RuntimeModels.DockerComposeResult result = runCommand(command);
        if (!result.successful()) {
            return List.of();
        }
        return result.output().stream()
                .map(this::containerFromColumns)
                .filter(container -> !container.name().isBlank())
                .toList();
    }

    @Override
    public RuntimeModels.DockerComposeResult archiveAndRemoveManagedProject(String projectName, String appId, Path archiveDirectory) {
        ContainerSelection selection = managedContainerIds(projectName, appId);
        if (!selection.successful()) {
            return new RuntimeModels.DockerComposeResult(selection.exitCode(), selection.output());
        }
        if (selection.containerIds().isEmpty()) {
            return new RuntimeModels.DockerComposeResult(0, List.of("No matching managed containers remained to archive or remove."));
        }
        try {
            Files.createDirectories(archiveDirectory);
        } catch (IOException exception) {
            return new RuntimeModels.DockerComposeResult(1, List.of("Could not create the container recovery archive folder: " + exception.getMessage()));
        }

        List<String> output = new ArrayList<>();
        for (String containerId : selection.containerIds()) {
            Path archive = archiveDirectory.resolve(safeFileToken(appId) + "-container-" + containerId.substring(0, Math.min(12, containerId.length())) + ".tar");
            RuntimeModels.DockerComposeResult exported = runCommand(List.of("docker", "export", "--output", archive.toString(), containerId));
            output.addAll(exported.output());
            if (!exported.successful() || !regularNonEmptyFile(archive)) {
                output.add("Container removal was cancelled because its writable-filesystem archive could not be verified: " + archive);
                return new RuntimeModels.DockerComposeResult(exported.successful() ? 1 : exported.exitCode(), output);
            }
            output.add("Saved container writable-filesystem recovery archive: " + archive);
        }

        List<String> remove = new ArrayList<>(List.of("docker", "rm", "-f"));
        remove.addAll(selection.containerIds());
        RuntimeModels.DockerComposeResult removed = runCommand(remove);
        output.addAll(removed.output());
        return new RuntimeModels.DockerComposeResult(removed.exitCode(), output);
    }

    @Override
    public List<RuntimeModels.ContainerTelemetry> stats(List<String> containerNames) {
        List<String> names = containerNames.stream()
                .filter(name -> name != null && !name.isBlank())
                .toList();
        if (names.isEmpty()) {
            return List.of();
        }
        List<String> command = new ArrayList<>(List.of(
                "docker",
                "stats",
                "--no-stream",
                "--format",
                "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"));
        command.addAll(names);
        RuntimeModels.DockerComposeResult result = runCommand(command);
        if (!result.successful() || result.output().isEmpty()) {
            return List.of();
        }
        return result.output().stream()
                .map(this::telemetry)
                .filter(telemetry -> !telemetry.containerName().isBlank())
                .toList();
    }

    private List<RuntimeModels.DockerContainerStatus> parseContainers(List<String> output) {
        String body = String.join("\n", output).trim();
        if (body.isBlank()) {
            return List.of();
        }
        List<String> objects = jsonObjects(body);
        if (objects.isEmpty()) {
            objects = output.stream()
                    .map(String::trim)
                    .filter(line -> line.startsWith("{") && line.endsWith("}"))
                    .toList();
        }
        if (objects.isEmpty()) {
            return List.of();
        }
        return objects.stream()
                .map(this::container)
                .toList();
    }

    private List<String> jsonObjects(String body) {
        List<String> objects = new ArrayList<>();
        int depth = 0;
        int start = -1;
        boolean inString = false;
        boolean escaped = false;
        for (int index = 0; index < body.length(); index++) {
            char current = body.charAt(index);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (current == '\\') {
                escaped = true;
                continue;
            }
            if (current == '"') {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }
            if (current == '{') {
                if (depth == 0) {
                    start = index;
                }
                depth++;
            } else if (current == '}') {
                depth--;
                if (depth == 0 && start >= 0) {
                    objects.add(body.substring(start, index + 1));
                    start = -1;
                }
            }
        }
        return objects;
    }

    private RuntimeModels.DockerContainerStatus container(String object) {
        return new RuntimeModels.DockerContainerStatus(
                text(object, "Name"),
                text(object, "Service"),
                text(object, "State"),
                text(object, "Health"),
                text(object, "Status"),
                text(object, "Ports"));
    }

    private String text(String object, String field) {
        Matcher matcher = Pattern.compile(FIELD_PATTERN.pattern().formatted(Pattern.quote(field))).matcher(object);
        if (!matcher.find()) {
            return "";
        }
        return matcher.group(1)
                .replace("\\u003e", ">")
                .replace("\\u003E", ">")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }

    private RuntimeModels.DockerComposeResult run(Path composeFile, String projectName, String... composeArgs) {
        List<String> command = new ArrayList<>(List.of("docker", "compose", "-f", composeFile.toString(), "-p", projectName));
        command.addAll(List.of(composeArgs));
        return runCommand(command);
    }

    private RuntimeModels.DockerComposeResult runCommand(List<String> command) {
        SystemCommandRunner.CommandExecutionResult result = commandRunner.run(command);
        if (result.missingCommand()) {
            throw new InstallationException("Unable to run Docker Compose. " + result.output());
        }
        return new RuntimeModels.DockerComposeResult(result.exitCode(), result.outputLines());
    }

    private ContainerSelection managedContainerIds(String projectName, String appId) {
        RuntimeModels.DockerComposeResult result = runCommand(managedDockerCommand("ps", "-a", projectName, appId, "--format", "{{.ID}}"));
        if (!result.successful()) {
            return new ContainerSelection(result.exitCode(), List.of(), result.output());
        }
        List<String> ids = result.output().stream()
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
        if (ids.stream().anyMatch(value -> !value.matches("[a-fA-F0-9]{12,64}"))) {
            return new ContainerSelection(1, List.of(), List.of("Docker returned an invalid managed container identifier; no containers were changed."));
        }
        return new ContainerSelection(0, ids, result.output());
    }

    private List<String> managedDockerCommand(String operation, String option, String projectName, String appId, String... trailing) {
        List<String> command = new ArrayList<>(List.of(
                "docker", operation, option,
                "--filter", "label=com.docker.compose.project=" + projectName,
                "--filter", "label=autark-os.app-id=" + appId));
        command.addAll(List.of(trailing));
        return command;
    }

    private String safeFileToken(String value) {
        String safe = value == null ? "app" : value.replaceAll("[^A-Za-z0-9._-]", "-");
        return safe.isBlank() ? "app" : safe;
    }

    private RuntimeModels.DockerContainerStatus containerFromColumns(String line) {
        String[] parts = line.split("\\t", -1);
        return new RuntimeModels.DockerContainerStatus(
                part(parts, 0),
                part(parts, 4),
                part(parts, 1),
                "",
                part(parts, 2),
                part(parts, 3));
    }

    private boolean regularNonEmptyFile(Path file) {
        try {
            return Files.isRegularFile(file) && Files.size(file) > 0;
        } catch (IOException exception) {
            return false;
        }
    }

    private record ContainerSelection(int exitCode, List<String> containerIds, List<String> output) {
        boolean successful() {
            return exitCode == 0;
        }
    }

    private RuntimeModels.ContainerTelemetry telemetry(String line) {
        String[] parts = line.split("\\t", -1);
        return new RuntimeModels.ContainerTelemetry(
                part(parts, 0),
                part(parts, 1),
                part(parts, 2),
                part(parts, 3),
                part(parts, 4),
                part(parts, 5));
    }

    private String part(String[] parts, int index) {
        return index >= parts.length ? "" : parts[index].trim();
    }
}
