package com.autarkos.marketplace.install;

import java.util.List;

import com.autarkos.marketplace.install.models.RuntimeModels;

public interface ManagedContainerDiscovery {
    List<RuntimeModels.ManagedContainer> findManagedContainers();
}
