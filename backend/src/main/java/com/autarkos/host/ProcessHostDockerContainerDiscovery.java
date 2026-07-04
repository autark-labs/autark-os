package com.autarkos.host;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.autarkos.system.SystemCommandRunner;

@Component
public class ProcessHostDockerContainerDiscovery implements HostDockerContainerDiscovery {

    private final SystemCommandRunner commandRunner;

    public ProcessHostDockerContainerDiscovery(SystemCommandRunner commandRunner) {
        this.commandRunner = commandRunner;
    }

    @Override
    public List<HostModels.HostDockerContainer> findContainers() {
        SystemCommandRunner.CommandExecutionResult result = commandRunner.run(
                "docker",
                "ps",
                "-a",
                "--format",
                "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Labels}}\t{{.Ports}}");
        if (!result.successful()) {
            return List.of();
        }
        return result.outputLines().stream()
                .map(this::container)
                .filter(container -> !container.name().isBlank())
                .toList();
    }

    private HostModels.HostDockerContainer container(String line) {
        String[] fields = line.split("\t", -1);
        return new HostModels.HostDockerContainer(
                field(fields, 0),
                field(fields, 1),
                field(fields, 2),
                labels(field(fields, 3)),
                field(fields, 4));
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

    private String field(String[] fields, int index) {
        return fields.length > index ? fields[index].trim() : "";
    }
}
