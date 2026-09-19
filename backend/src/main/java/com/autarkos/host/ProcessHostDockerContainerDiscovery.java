package com.autarkos.host;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.autarkos.system.SystemCommandRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class ProcessHostDockerContainerDiscovery implements HostDockerContainerDiscovery {

    static final String PRO_MANAGED_LABEL =
            "com.autarkos.pro.managed";

    private final SystemCommandRunner commandRunner;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ProcessHostDockerContainerDiscovery(SystemCommandRunner commandRunner) {
        this.commandRunner = commandRunner;
    }

    @Override
    public DockerInventory observeContainers() {
        SystemCommandRunner.CommandExecutionResult result = commandRunner.run(
                "docker",
                "ps",
                "-a",
                "--format",
                "{{json .}}");
        if (!result.successful()) {
            return DockerInventory.failed(result.output());
        }
        List<HostModels.HostDockerContainer> containers;
        try {
            containers = result.outputLines().stream()
                .map(this::container)
                .filter(container -> !container.name().isBlank())
                .filter(container -> !"true".equals(
                        container.labels().get(
                                PRO_MANAGED_LABEL)))
                .toList();
        } catch (IllegalArgumentException exception) {
            return DockerInventory.failed("Docker returned unreadable container details.");
        }
        if (containers.isEmpty()) {
            return DockerInventory.successful(List.of());
        }
        return inspectMounts(containers);
    }

    private DockerInventory inspectMounts(List<HostModels.HostDockerContainer> containers) {
        List<String> command = new ArrayList<>(List.of(
                "docker", "inspect", "--format", "{{.Name}}\t{{json .Mounts}}"));
        containers.stream().map(HostModels.HostDockerContainer::name).forEach(command::add);
        SystemCommandRunner.CommandExecutionResult result = commandRunner.run(command.toArray(String[]::new));
        if (!result.successful()) {
            return DockerInventory.failed(result.output());
        }
        Map<String, List<HostModels.HostDockerMount>> mountsByContainer = new LinkedHashMap<>();
        try {
            for (String line : result.outputLines()) {
                int separator = line.indexOf('\t');
                if (separator < 0) {
                    return DockerInventory.failed("Docker returned incomplete live mount details.");
                }
                String name = normalizeName(line.substring(0, separator));
                mountsByContainer.put(name, mounts(line.substring(separator + 1)));
            }
        } catch (RuntimeException exception) {
            return DockerInventory.failed("Docker returned unreadable live mount details.");
        }
        if (!mountsByContainer.keySet().containsAll(containers.stream().map(HostModels.HostDockerContainer::name).toList())) {
            return DockerInventory.failed("Docker did not return live mount details for every container.");
        }
        return DockerInventory.successful(containers.stream()
                .map(container -> new HostModels.HostDockerContainer(
                        container.name(), container.image(), container.status(), container.labels(), container.ports(),
                        mountsByContainer.get(container.name())))
                .toList());
    }

    private List<HostModels.HostDockerMount> mounts(String json) {
        try {
            JsonNode root = objectMapper.readTree(json);
            if (root == null || !root.isArray()) {
                throw new IllegalArgumentException("Mount details are not an array.");
            }
            List<HostModels.HostDockerMount> mounts = new ArrayList<>();
            for (JsonNode mount : root) {
                mounts.add(new HostModels.HostDockerMount(
                        mount.path("Type").asText(""),
                        mount.path("Source").asText(""),
                        mount.path("Destination").asText(""),
                        !mount.path("RW").asBoolean(false)));
            }
            return List.copyOf(mounts);
        } catch (java.io.IOException exception) {
            throw new IllegalArgumentException("Mount details are invalid.", exception);
        }
    }

    private String normalizeName(String name) {
        String normalized = name == null ? "" : name.trim();
        return normalized.startsWith("/") ? normalized.substring(1) : normalized;
    }

    private HostModels.HostDockerContainer container(String line) {
        try {
            JsonNode row = objectMapper.readTree(line);
            if (row == null || row.path("Names").asText().isBlank()) {
                throw new IllegalArgumentException("Container name is missing.");
            }
            return new HostModels.HostDockerContainer(
                    row.path("Names").asText(), row.path("Image").asText(),
                    row.path("Status").asText(), labels(row.path("Labels").asText()),
                    row.path("Ports").asText());
        } catch (java.io.IOException exception) {
            throw new IllegalArgumentException("Invalid container details.", exception);
        }
    }

    private Map<String, String> labels(String labels) {
        Map<String, String> parsed = new LinkedHashMap<>();
        if (labels == null || labels.isBlank()) {
            return parsed;
        }
        for (String label : labels.split(",")) {
            int equals = label.indexOf('=');
            if (equals > 0) {
                parsed.put(label.substring(0, equals), label.substring(equals + 1));
            }
        }
        return parsed;
    }

}
