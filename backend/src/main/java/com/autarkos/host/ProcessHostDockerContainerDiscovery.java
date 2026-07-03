package com.autarkos.host;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

@Component
public class ProcessHostDockerContainerDiscovery implements HostDockerContainerDiscovery {

    @Override
    public List<HostDockerContainer> findContainers() {
        ProcessBuilder processBuilder = new ProcessBuilder(
                "docker",
                "ps",
                "-a",
                "--format",
                "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Labels}}\t{{.Ports}}");
        processBuilder.redirectErrorStream(true);
        try {
            Process process = processBuilder.start();
            List<HostDockerContainer> containers;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                containers = reader.lines()
                        .map(this::container)
                        .filter(container -> !container.name().isBlank())
                        .toList();
            }
            return process.waitFor() == 0 ? containers : List.of();
        } catch (IOException exception) {
            return List.of();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return List.of();
        }
    }

    private HostDockerContainer container(String line) {
        String[] fields = line.split("\t", -1);
        return new HostDockerContainer(
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
