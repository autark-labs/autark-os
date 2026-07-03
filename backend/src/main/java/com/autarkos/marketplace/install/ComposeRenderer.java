package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.RuntimeServiceManifest;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Component
public class ComposeRenderer {

    private final RuntimeLayout runtimeLayout;
    private final DockerOwnershipService dockerOwnershipService;

    @Autowired
    public ComposeRenderer(RuntimeLayout runtimeLayout, DockerOwnershipService dockerOwnershipService) {
        this.runtimeLayout = runtimeLayout;
        this.dockerOwnershipService = dockerOwnershipService;
    }

    public ComposeRenderer(RuntimeLayout runtimeLayout) {
        this.runtimeLayout = runtimeLayout;
        this.dockerOwnershipService = null;
    }

    public Path render(ApplicationManifest manifest, Path appRoot) {
        return render(manifest, appRoot, new ResolvedRuntimeConfiguration(manifest.runtime().ports(), manifest.accessUrl()));
    }

    public Path render(ApplicationManifest manifest, Path appRoot, ResolvedRuntimeConfiguration runtimeConfiguration) {
        return render(manifest, appRoot, runtimeConfiguration, "", "");
    }

    public Path render(ApplicationManifest manifest, Path appRoot, ResolvedRuntimeConfiguration runtimeConfiguration, String appInstanceId, String composeProject) {
        String compose = composeYaml(manifest, runtimeConfiguration, appInstanceId, composeProject);
        Path composePath = appRoot.resolve("compose.yaml");
        try {
            Files.createDirectories(composePath.getParent());
            Files.writeString(composePath, compose);
            return composePath;
        } catch (IOException exception) {
            throw new InstallationException("Unable to render Compose file for " + manifest.name(), exception);
        }
    }

    private String composeYaml(ApplicationManifest manifest, ResolvedRuntimeConfiguration runtimeConfiguration, String appInstanceId, String composeProject) {
        StringBuilder yaml = new StringBuilder();
        yaml.append("services:\n");
        if (manifest.runtime().multiService()) {
            List<RuntimeServiceManifest> services = manifest.runtime().services();
            for (int index = 0; index < services.size(); index++) {
                RuntimeServiceManifest service = services.get(index);
                List<String> servicePorts = servicePorts(runtimeConfiguration, service, index);
                appendService(yaml, manifest, service, servicePorts, runtimeConfiguration, appInstanceId, composeProject);
            }
        } else {
            appendLegacyService(yaml, manifest, runtimeConfiguration, appInstanceId, composeProject);
        }
        if (!manifest.runtime().network().equalsIgnoreCase("host")) {
            yaml.append("networks:\n");
            yaml.append("  ").append(manifest.runtime().network()).append(":\n");
            yaml.append("    name: ").append(manifest.runtime().network()).append("\n");
        }
        return yaml.toString();
    }

    private void appendLegacyService(StringBuilder yaml, ApplicationManifest manifest, ResolvedRuntimeConfiguration runtimeConfiguration, String appInstanceId, String composeProject) {
        yaml.append("  ").append(manifest.runtime().containerName()).append(":\n");
        yaml.append("    image: ").append(manifest.runtime().image()).append("\n");
        yaml.append("    container_name: ").append(containerName(manifest, composeProject)).append("\n");
        yaml.append("    restart: unless-stopped\n");
        appendNetwork(yaml, manifest);
        appendPorts(yaml, manifest, runtimeConfiguration.ports());
        appendVolumes(yaml, manifest, manifest.runtime().volumes(), runtimeConfiguration);
        appendEnvironment(yaml, manifest.runtime().environment());
        appendLabels(yaml, labels(manifest, manifest.runtime().labels(), appInstanceId, composeProject));
    }

    private void appendService(StringBuilder yaml, ApplicationManifest manifest, RuntimeServiceManifest service, List<String> servicePorts, ResolvedRuntimeConfiguration runtimeConfiguration, String appInstanceId, String composeProject) {
        yaml.append("  ").append(service.name()).append(":\n");
        yaml.append("    image: ").append(service.image()).append("\n");
        yaml.append("    container_name: ").append(containerName(service, composeProject)).append("\n");
        yaml.append("    restart: unless-stopped\n");
        appendNetwork(yaml, manifest);
        if (!service.dependsOn().isEmpty()) {
            yaml.append("    depends_on:\n");
            for (String dependency : service.dependsOn()) {
                yaml.append("      - ").append(dependency).append("\n");
            }
        }
        appendPorts(yaml, manifest, servicePorts);
        appendVolumes(yaml, manifest, service.volumes(), runtimeConfiguration);
        appendEnvironment(yaml, service.environment());
        appendLabels(yaml, labels(manifest, serviceLabels(manifest, service), appInstanceId, composeProject));
    }

    private List<String> servicePorts(ResolvedRuntimeConfiguration runtimeConfiguration, RuntimeServiceManifest service, int serviceIndex) {
        List<String> ports = runtimeConfiguration.portsFor(service.name());
        if (!ports.isEmpty() || !runtimeConfiguration.servicePorts().isEmpty()) {
            return ports;
        }
        return serviceIndex == 0 ? runtimeConfiguration.ports() : List.of();
    }

    private void appendNetwork(StringBuilder yaml, ApplicationManifest manifest) {
        if (!manifest.runtime().network().equalsIgnoreCase("host")) {
            yaml.append("    networks:\n");
            yaml.append("      - ").append(manifest.runtime().network()).append("\n");
        } else {
            yaml.append("    network_mode: host\n");
        }
    }

    private void appendPorts(StringBuilder yaml, ApplicationManifest manifest, List<String> ports) {
        if (!ports.isEmpty() && !manifest.runtime().network().equalsIgnoreCase("host")) {
            yaml.append("    ports:\n");
            for (String port : ports) {
                yaml.append("      - \"").append(rewritePort(manifest, port)).append("\"\n");
            }
        }
    }

    private void appendVolumes(StringBuilder yaml, ApplicationManifest manifest, List<String> volumes, ResolvedRuntimeConfiguration runtimeConfiguration) {
        if (!volumes.isEmpty()) {
            yaml.append("    volumes:\n");
            for (String volume : volumes) {
                yaml.append("      - \"").append(rewriteVolume(manifest, volume, runtimeConfiguration)).append("\"\n");
            }
        }
    }

    private void appendEnvironment(StringBuilder yaml, List<String> environmentEntries) {
        if (!environmentEntries.isEmpty()) {
            yaml.append("    environment:\n");
            for (String environment : environmentEntries) {
                yaml.append("      - \"").append(escape(environment)).append("\"\n");
            }
        }
    }

    private void appendLabels(StringBuilder yaml, List<String> labels) {
        if (!labels.isEmpty()) {
            yaml.append("    labels:\n");
            for (String label : labels) {
                yaml.append("      - \"").append(escape(label)).append("\"\n");
            }
        }
    }

    private List<String> serviceLabels(ApplicationManifest manifest, RuntimeServiceManifest service) {
        List<String> labels = new ArrayList<>(manifest.runtime().labels());
        labels.addAll(service.labels());
        return labels.stream().distinct().toList();
    }

    private List<String> labels(ApplicationManifest manifest, List<String> manifestLabels, String appInstanceId, String composeProject) {
        if (dockerOwnershipService == null || appInstanceId == null || appInstanceId.isBlank() || composeProject == null || composeProject.isBlank()) {
            return manifestLabels.stream().distinct().toList();
        }
        Map<String, String> merged = new LinkedHashMap<>();
        List<String> passthrough = new ArrayList<>();
        for (String label : manifestLabels) {
            int separator = label.indexOf('=');
            if (separator <= 0) {
                passthrough.add(label);
                continue;
            }
            String key = label.substring(0, separator);
            String value = label.substring(separator + 1);
            if (!key.startsWith("autark-os.")) {
                merged.put(key, value);
            }
        }
        merged.putAll(dockerOwnershipService.labels(manifest.id(), appInstanceId, composeProject));
        List<String> rendered = new ArrayList<>(passthrough);
        rendered.addAll(merged.entrySet().stream().map(entry -> entry.getKey() + "=" + entry.getValue()).toList());
        return rendered.stream().distinct().toList();
    }

    private String containerName(ApplicationManifest manifest, String composeProject) {
        if (dockerOwnershipService == null || composeProject == null || composeProject.isBlank()) {
            return "autark-os-" + manifest.id();
        }
        return composeProject;
    }

    private String containerName(RuntimeServiceManifest service, String composeProject) {
        if (dockerOwnershipService == null || composeProject == null || composeProject.isBlank()) {
            return service.containerName();
        }
        return composeProject + "_" + service.name();
    }

    private String rewriteVolume(ApplicationManifest manifest, String volume, ResolvedRuntimeConfiguration runtimeConfiguration) {
        String[] parts = volume.split(":", 2);
        if (parts.length != 2) {
            return volume;
        }
        String hostPath = parts[0];
        String containerPath = parts[1];
        String relative = hostPath.replace(manifest.runtime().runtimeRoot(), "");
        while (relative.startsWith("/")) {
            relative = relative.substring(1);
        }
        if (runtimeConfiguration.storageHostPaths().containsKey(relative)) {
            return runtimeConfiguration.storageHostPaths().get(relative) + ":" + containerPath;
        }
        relative = runtimeConfiguration.storageSubfolders().getOrDefault(relative, relative);
        return runtimeLayout.appPath(manifest.id(), relative) + ":" + containerPath;
    }

    private String rewritePort(ApplicationManifest manifest, String port) {
        if (!manifest.usage().privateHttpsRequired() || port == null || port.isBlank() || port.startsWith("127.0.0.1:")) {
            return port;
        }
        return "127.0.0.1:" + port;
    }

    private String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
