package com.projectos.host;

import java.util.List;

public interface HostDockerContainerDiscovery {
    List<HostDockerContainer> findContainers();
}
