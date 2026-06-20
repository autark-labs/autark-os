package com.projectos.marketplace.install;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

@Component
public class ProcessManagedContainerDiscovery implements ManagedContainerDiscovery {

    @Override
    public List<ManagedContainer> findManagedContainers() {
        List<String> command = List.of(
                "docker",
                "ps",
                "-a",
                "--filter",
                "label=project-os.managed=true",
                "--format",
                "{{.Names}}\t{{.Label \"project-os.app-id\"}}\t{{.Status}}");
        ProcessBuilder processBuilder = new ProcessBuilder(command);
        processBuilder.redirectErrorStream(true);
        try {
            Process process = processBuilder.start();
            List<ManagedContainer> containers = new ArrayList<>();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String[] fields = line.split("\t", 3);
                    if (fields.length == 3 && !fields[1].isBlank()) {
                        containers.add(new ManagedContainer(fields[1], fields[0], fields[2]));
                    }
                }
            }
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                return List.of();
            }
            return containers;
        } catch (IOException exception) {
            return List.of();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return List.of();
        }
    }
}
