package com.autarkos.host;

import java.util.List;

public interface HostDockerContainerDiscovery {
    DockerInventory observeContainers();

    record DockerInventory(boolean successful, List<HostModels.HostDockerContainer> containers, String diagnostic) {
        public DockerInventory {
            containers = List.copyOf(containers == null ? List.of() : containers);
            diagnostic = diagnostic == null ? "" : diagnostic;
        }

        static DockerInventory successful(List<HostModels.HostDockerContainer> containers) {
            return new DockerInventory(true, containers, "");
        }

        static DockerInventory failed(String diagnostic) {
            return new DockerInventory(false, List.of(), diagnostic);
        }
    }
}
