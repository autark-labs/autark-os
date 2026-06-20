package com.projectos.marketplace.install;

import java.net.URI;
import java.util.List;

import com.projectos.marketplace.model.ApplicationManifest;

class AppRuntimeStatusResolver {

    List<String> containerNames(List<DockerContainerStatus> containers) {
        return containers.stream()
                .map(DockerContainerStatus::name)
                .filter(name -> name != null && !name.isBlank())
                .toList();
    }

    String accessUrl(InstalledApp app, ApplicationManifest manifest, List<DockerContainerStatus> containers) {
        Integer manifestPort = manifest == null ? null : portFromUrl(manifest.accessUrl());
        Integer storedPort = portFromUrl(app.accessUrl());
        return publishedAccessUrl(containers, manifestPort, storedPort)
                .orElseGet(() -> manifestAccessUrl(app, manifest));
    }

    java.util.Optional<String> publishedAccessUrl(List<DockerContainerStatus> containers, Integer manifestPort, Integer storedPort) {
        List<String> ports = containers.stream()
                .map(DockerContainerStatus::ports)
                .flatMap(portsValue -> publishedPorts(portsValue).stream())
                .distinct()
                .toList();
        if (ports.isEmpty()) {
            return java.util.Optional.empty();
        }
        if (manifestPort != null && ports.contains(manifestPort.toString())) {
            return java.util.Optional.of("http://localhost:" + manifestPort);
        }
        if (storedPort != null && ports.contains(storedPort.toString())) {
            return java.util.Optional.of("http://localhost:" + storedPort);
        }
        return java.util.Optional.of("http://localhost:" + ports.get(0));
    }

    List<String> publishedPorts(String ports) {
        if (ports == null || ports.isBlank()) {
            return List.of();
        }
        java.util.ArrayList<String> matches = new java.util.ArrayList<>();
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(?::|0\\.0\\.0\\.0:|\\[::]:)(\\d+)(?:->|-\\\\u003e)").matcher(ports);
        while (matcher.find()) {
            matches.add(matcher.group(1));
        }
        return matches;
    }

    Integer portFromUrl(String accessUrl) {
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

    String protocolFromUrl(String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return "http";
        }
        try {
            String scheme = URI.create(accessUrl).getScheme();
            return scheme == null || scheme.isBlank() ? "http" : scheme.toLowerCase();
        } catch (IllegalArgumentException exception) {
            return "http";
        }
    }

    String manifestAccessUrl(InstalledApp app, ApplicationManifest manifest) {
        if (manifest == null) {
            return app.accessUrl();
        }
        if (manifest.accessUrl() != null && !manifest.accessUrl().isBlank()) {
            return manifest.accessUrl();
        }
        return app.accessUrl();
    }

    AppRuntimeStatus normalize(List<DockerContainerStatus> containers) {
        if (containers.isEmpty()) {
            return new AppRuntimeStatus("Stopped", "No managed containers found", "not running");
        }
        String technicalStatus = containers.stream()
                .map(this::technicalStatus)
                .reduce((left, right) -> left + "; " + right)
                .orElse("No managed containers found");
        if (containers.stream().anyMatch(this::unhealthy)) {
            return new AppRuntimeStatus("Needs attention", technicalStatus, "failing");
        }
        if (containers.stream().anyMatch(this::starting)) {
            return new AppRuntimeStatus("Starting", technicalStatus, "starting");
        }
        if (containers.stream().allMatch(this::stopped)) {
            return new AppRuntimeStatus("Stopped", technicalStatus, "not running");
        }
        if (containers.stream().anyMatch(this::running)) {
            String health = containers.stream().anyMatch(this::healthy) ? "passing" : "running";
            return new AppRuntimeStatus("Ready", technicalStatus, health);
        }
        return new AppRuntimeStatus("Starting", technicalStatus, "pending");
    }

    private boolean running(DockerContainerStatus container) {
        return normalized(container.state()).equals("running");
    }

    private boolean healthy(DockerContainerStatus container) {
        return normalized(container.health()).equals("healthy");
    }

    private boolean unhealthy(DockerContainerStatus container) {
        return normalized(container.health()).equals("unhealthy");
    }

    private boolean starting(DockerContainerStatus container) {
        String health = normalized(container.health());
        String state = normalized(container.state());
        return health.equals("starting") || state.equals("restarting");
    }

    private boolean stopped(DockerContainerStatus container) {
        String state = normalized(container.state());
        return state.equals("exited") || state.equals("created") || state.equals("dead") || state.equals("removing");
    }

    private String technicalStatus(DockerContainerStatus container) {
        String state = container.state().isBlank() ? "unknown" : container.state();
        String health = container.health().isBlank() ? "no health check" : container.health();
        String name = container.name().isBlank() ? container.service() : container.name();
        return name + ": " + state + " (" + health + ")";
    }

    private String normalized(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }
}
