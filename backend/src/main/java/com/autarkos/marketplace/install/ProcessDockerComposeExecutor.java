package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

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
    public RuntimeModels.DockerComposeResult stop(Path composeFile, String projectName) {
        return run(composeFile, projectName, "stop");
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
