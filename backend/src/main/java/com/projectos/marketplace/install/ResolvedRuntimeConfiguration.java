package com.projectos.marketplace.install;

import java.util.List;
import java.util.Map;

public record ResolvedRuntimeConfiguration(
        List<String> ports,
        Map<String, List<String>> servicePorts,
        String accessUrl,
        String privateAccessUrl,
        Map<String, String> storageSubfolders,
        Map<String, String> storageHostPaths,
        boolean tailscaleEnabled,
        BackupPolicy backup) {

    public ResolvedRuntimeConfiguration(List<String> ports, String accessUrl) {
        this(ports, Map.of(), accessUrl, null, Map.of(), Map.of(), false, BackupPolicy.defaults());
    }

    public List<String> portsFor(String serviceName) {
        return servicePorts.getOrDefault(serviceName, List.of());
    }
}
