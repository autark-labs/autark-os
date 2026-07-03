package com.autarkos.marketplace.install;

import java.util.List;

public interface ManagedContainerDiscovery {
    List<ManagedContainer> findManagedContainers();
}
