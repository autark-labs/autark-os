package com.autarkos.marketplace.install;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.system.SystemCommandRunner;

@Component
public class ProcessManagedContainerDiscovery implements ManagedContainerDiscovery {

    private final DockerOwnershipService dockerOwnershipService;
    private final SystemCommandRunner commandRunner;

    @Autowired
    public ProcessManagedContainerDiscovery(DockerOwnershipService dockerOwnershipService, SystemCommandRunner commandRunner) {
        this.dockerOwnershipService = dockerOwnershipService;
        this.commandRunner = commandRunner;
    }

    @Override
    public List<RuntimeModels.ManagedContainer> findManagedContainers() {
        List<String> command = List.of(
                "docker",
                "ps",
                "-a",
                "--filter",
                "label=autark-os.managed=true",
                "--format",
                "{{.Names}}\t{{.Label \"autark-os.app-id\"}}\t{{.Status}}\t{{.Label \"autark-os.instance-id\"}}\t{{.Label \"autark-os.runtime-root-hash\"}}\t{{.Label \"autark-os.app-instance-id\"}}\t{{.Label \"autark-os.compose-project\"}}");
        SystemCommandRunner.CommandExecutionResult result = commandRunner.run(command);
        if (!result.successful()) {
            return List.of();
        }
        List<RuntimeModels.ManagedContainer> containers = new ArrayList<>();
        for (String line : result.outputLines()) {
            String[] fields = line.split("\t", -1);
            if (fields.length >= 7 && !fields[1].isBlank()) {
                Map<String, String> labels = Map.of(
                        DockerOwnershipService.MANAGED, "true",
                        DockerOwnershipService.APP_ID, fields[1],
                        DockerOwnershipService.INSTANCE_ID, fields[3],
                        DockerOwnershipService.RUNTIME_ROOT_HASH, fields[4],
                        DockerOwnershipService.APP_INSTANCE_ID, fields[5],
                        DockerOwnershipService.COMPOSE_PROJECT, fields[6]);
                RuntimeModels.DockerResourceClassification classification = dockerOwnershipService.classify(fields[0], labels);
                containers.add(new RuntimeModels.ManagedContainer(fields[1], fields[0], fields[2], classification.ownership(), classification.appInstanceId(), classification.composeProject()));
            }
        }
        return containers;
    }
}
