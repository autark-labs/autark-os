package com.projectos.host;

import java.util.List;

@FunctionalInterface
public interface HostInventoryProvider {
    List<HostInventoryResource> inventory(boolean includeIgnored);
}
