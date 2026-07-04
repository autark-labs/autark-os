package com.autarkos.marketplace.install;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.RuntimeServiceManifest;

@Component
public class PortAllocator {

    private static final int MAX_PORT = 65535;

    public RuntimeModels.ResolvedRuntimeConfiguration resolve(ApplicationManifest manifest) {
        List<String> resolvedPorts = resolvePorts(manifest, null);
        return new RuntimeModels.ResolvedRuntimeConfiguration(resolvedPorts, accessUrl(manifest, resolvedPorts));
    }

    public List<String> resolvePorts(ApplicationManifest manifest, InstallOptionsRequest.PortOptions options) {
        return resolveServicePorts(manifest, options).values().stream().flatMap(List::stream).toList();
    }

    public Map<String, List<String>> resolveServicePorts(ApplicationManifest manifest, InstallOptionsRequest.PortOptions options) {
        if (!manifest.runtime().multiService()) {
            return Map.of(manifest.runtime().containerName(), resolvePortList(manifest.runtime().ports(), options));
        }
        Map<String, List<String>> resolved = new LinkedHashMap<>();
        boolean explicitApplied = false;
        for (RuntimeServiceManifest service : manifest.runtime().services()) {
            List<String> servicePorts = new ArrayList<>();
            for (String port : service.ports()) {
                if (options != null && options.hostPort() != null && !explicitApplied) {
                    servicePorts.add(resolveExplicitPort(port, options.hostPort()));
                    explicitApplied = true;
                } else {
                    servicePorts.add(resolvePort(port));
                }
            }
            resolved.put(service.name(), servicePorts);
        }
        return resolved;
    }

    private List<String> resolvePortList(List<String> ports, InstallOptionsRequest.PortOptions options) {
        if (options != null && options.hostPort() != null && !ports.isEmpty()) {
            return List.of(resolveExplicitPort(ports.get(0), options.hostPort()));
        }
        if (ports.isEmpty()) {
            return List.of();
        }

        List<String> resolvedPorts = new ArrayList<>();
        for (String requestedPort : ports) {
            resolvedPorts.add(resolvePort(requestedPort));
        }
        return resolvedPorts;
    }

    private String resolveExplicitPort(String defaultPortMapping, int hostPort) {
        if (hostPort < 1 || hostPort > MAX_PORT) {
            throw new InstallationException("Host port must be between 1 and 65535.");
        }
        if (!isAvailable(hostPort)) {
            throw new InstallationException("Port " + hostPort + " is already in use. Choose another port or use automatic port selection.");
        }
        return hostPort + ":" + parse(defaultPortMapping).containerPort();
    }

    public String accessUrl(ApplicationManifest manifest, List<String> ports) {
        if (ports.isEmpty()) {
            return manifest.accessUrl();
        }
        Integer preferredPort = portFromAccessUrl(manifest.accessUrl());
        if (preferredPort != null) {
            for (String port : ports) {
                PortMapping mapping = parse(port);
                if (preferredPort.toString().equals(mapping.hostPort())) {
                    return "http://localhost:" + mapping.hostPort();
                }
            }
        }
        PortMapping first = parse(ports.get(0));
        String hostPort = first.hostPort().isBlank() ? first.containerPortNumber() : first.hostPort();
        return "http://localhost:" + hostPort;
    }

    private Integer portFromAccessUrl(String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return null;
        }
        try {
            java.net.URI uri = java.net.URI.create(accessUrl);
            if (uri.getPort() > 0) {
                return uri.getPort();
            }
            if ("http".equalsIgnoreCase(uri.getScheme())) {
                return 80;
            }
            if ("https".equalsIgnoreCase(uri.getScheme())) {
                return 443;
            }
            return null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private String resolvePort(String portMapping) {
        PortMapping mapping = parse(portMapping);
        if (mapping.hostPort().isBlank()) {
            return portMapping;
        }
        int hostPort = Integer.parseInt(mapping.hostPort());
        int availablePort = availablePort(hostPort);
        if (availablePort == hostPort) {
            return portMapping;
        }
        return availablePort + ":" + mapping.containerPort();
    }

    private int availablePort(int preferredPort) {
        for (int port = preferredPort; port <= MAX_PORT; port++) {
            if (isAvailable(port)) {
                return port;
            }
        }
        throw new InstallationException("No available port found starting at " + preferredPort + ".");
    }

    private boolean isAvailable(int port) {
        try (ServerSocket socket = new ServerSocket()) {
            socket.setReuseAddress(false);
            socket.bind(new InetSocketAddress("0.0.0.0", port));
            return true;
        } catch (IOException exception) {
            return false;
        }
    }

    private PortMapping parse(String portMapping) {
        String[] parts = portMapping.split(":", 2);
        if (parts.length == 1) {
            return new PortMapping("", parts[0]);
        }
        return new PortMapping(parts[0], parts[1]);
    }

    private record PortMapping(String hostPort, String containerPort) {
        private String containerPortNumber() {
            return containerPort.split("/", 2)[0];
        }
    }
}
