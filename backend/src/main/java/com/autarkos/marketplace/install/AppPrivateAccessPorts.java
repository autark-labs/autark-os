package com.autarkos.marketplace.install;

import java.net.URI;
import java.util.HashSet;
import java.util.Set;

import com.autarkos.marketplace.install.models.InstallModels;

final class AppPrivateAccessPorts {

    private static final int FIRST_PRIVATE_PORT = 12000;
    private static final int PRIVATE_PORT_COUNT = 4000;

    private AppPrivateAccessPorts() {
    }

    static int selectHttpsPort(String appId, int localPort, InstalledAppRepository repository) {
        Set<Integer> usedPorts = usedPorts(appId, repository);
        Integer existingPrivatePort = repository.settingsFor(appId)
                .map(InstallModels.InstallSettings::privateAccessUrl)
                .map(AppPrivateAccessPorts::portFromUrl)
                .filter(port -> port != null && port != localPort && !usedPorts.contains(port))
                .orElse(null);
        if (existingPrivatePort != null) {
            return existingPrivatePort;
        }

        int startOffset = Math.floorMod(appId.hashCode(), PRIVATE_PORT_COUNT);
        for (int offset = 0; offset < PRIVATE_PORT_COUNT; offset++) {
            int candidate = FIRST_PRIVATE_PORT + ((startOffset + offset) % PRIVATE_PORT_COUNT);
            if (candidate != localPort && !usedPorts.contains(candidate)) {
                return candidate;
            }
        }
        throw new InstallationException("Autark-OS could not find an available private HTTPS port for this app.");
    }

    static Integer portFromUrl(String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return null;
        }
        try {
            URI uri = URI.create(accessUrl);
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

    private static Set<Integer> usedPorts(String appId, InstalledAppRepository repository) {
        Set<Integer> ports = new HashSet<>();
        for (InstalledApp app : repository.findAllApps()) {
            add(ports, portFromUrl(app.accessUrl()));
            repository.settingsFor(app.appId()).ifPresent(settings -> {
                add(ports, portFromUrl(settings.accessUrl()));
                if (!appId.equals(app.appId())) {
                    add(ports, portFromUrl(settings.privateAccessUrl()));
                }
            });
        }
        return ports;
    }

    private static void add(Set<Integer> ports, Integer port) {
        if (port != null && port > 0) {
            ports.add(port);
        }
    }
}
