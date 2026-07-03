package com.autarkos.marketplace.install;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class ProcessManagedContainerDiscovery implements ManagedContainerDiscovery {

    private final DockerOwnershipService dockerOwnershipService;

    @Autowired
    public ProcessManagedContainerDiscovery(DockerOwnershipService dockerOwnershipService) {
        this.dockerOwnershipService = dockerOwnershipService;
    }

    @Override
    public List<ManagedContainer> findManagedContainers() {
        List<String> command = List.of(
                "docker",
                "ps",
                "-a",
                "--filter",
                "label=autark-os.managed=true",
                "--format",
                "{{.Names}}\t{{.Label \"autark-os.app-id\"}}\t{{.Status}}\t{{.Label \"autark-os.instance-id\"}}\t{{.Label \"autark-os.runtime-root-hash\"}}\t{{.Label \"autark-os.app-instance-id\"}}\t{{.Label \"autark-os.compose-project\"}}");
        ProcessBuilder processBuilder = new ProcessBuilder(command);
        processBuilder.redirectErrorStream(true);
        try {
            Process process = processBuilder.start();
            List<ManagedContainer> containers = new ArrayList<>();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String[] fields = line.split("\t", -1);
                    if (fields.length >= 7 && !fields[1].isBlank()) {
                        Map<String, String> labels = Map.of(
                                DockerOwnershipService.MANAGED, "true",
                                DockerOwnershipService.APP_ID, fields[1],
                                DockerOwnershipService.INSTANCE_ID, fields[3],
                                DockerOwnershipService.RUNTIME_ROOT_HASH, fields[4],
                                DockerOwnershipService.APP_INSTANCE_ID, fields[5],
                                DockerOwnershipService.COMPOSE_PROJECT, fields[6]);
                        DockerResourceClassification classification = dockerOwnershipService.classify(fields[0], labels);
                        containers.add(new ManagedContainer(fields[1], fields[0], fields[2], classification.ownership(), classification.appInstanceId(), classification.composeProject()));
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
