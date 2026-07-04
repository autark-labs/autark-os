package com.autarkos.host;

import java.util.List;

public interface HostDockerContainerDiscovery {
    List<HostModels.HostDockerContainer> findContainers();
}
