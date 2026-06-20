package com.projectos.marketplace.install;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.marketplace.model.RuntimeServiceManifest;
import com.projectos.marketplace.runtime.RuntimeLayout;

@Component
public class ComposeRenderer {

    private final RuntimeLayout runtimeLayout;

    public ComposeRenderer(RuntimeLayout runtimeLayout) {
        this.runtimeLayout = runtimeLayout;
    }

    public Path render(ApplicationManifest manifest, Path appRoot) {
        return render(manifest, appRoot, new ResolvedRuntimeConfiguration(manifest.runtime().ports(), manifest.accessUrl()));
    }

    public Path render(ApplicationManifest manifest, Path appRoot, ResolvedRuntimeConfiguration runtimeConfiguration) {
        String compose = composeYaml(manifest, runtimeConfiguration);
        Path composePath = appRoot.resolve("compose.yaml");
        try {
            Files.writeString(composePath, compose);
            return composePath;
        } catch (IOException exception) {
            throw new InstallationException("Unable to render Compose file for " + manifest.name(), exception);
        }
    }

    private String composeYaml(ApplicationManifest manifest, ResolvedRuntimeConfiguration runtimeConfiguration) {
        StringBuilder yaml = new StringBuilder();
        yaml.append("services:\n");
        if (manifest.runtime().multiService()) {
            List<RuntimeServiceManifest> services = manifest.runtime().services();
            for (int index = 0; index < services.size(); index++) {
                RuntimeServiceManifest service = services.get(index);
                List<String> servicePorts = servicePorts(runtimeConfiguration, service, index);
                appendService(yaml, manifest, service, servicePorts, runtimeConfiguration);
            }
        } else {
            appendLegacyService(yaml, manifest, runtimeConfiguration);
        }
        if (!manifest.runtime().network().equalsIgnoreCase("host")) {
            yaml.append("networks:\n");
            yaml.append("  ").append(manifest.runtime().network()).append(":\n");
            yaml.append("    name: ").append(manifest.runtime().network()).append("\n");
        }
        return yaml.toString();
    }

    private void appendLegacyService(StringBuilder yaml, ApplicationManifest manifest, ResolvedRuntimeConfiguration runtimeConfiguration) {
        yaml.append("  ").append(manifest.runtime().containerName()).append(":\n");
        yaml.append("    image: ").append(manifest.runtime().image()).append("\n");
        yaml.append("    container_name: project-os-").append(manifest.id()).append("\n");
        yaml.append("    restart: unless-stopped\n");
        appendNetwork(yaml, manifest);
        appendPorts(yaml, manifest, runtimeConfiguration.ports());
        appendVolumes(yaml, manifest, manifest.runtime().volumes(), runtimeConfiguration);
        appendEnvironment(yaml, manifest.runtime().environment());
        appendLabels(yaml, manifest.runtime().labels());
    }

    private void appendService(StringBuilder yaml, ApplicationManifest manifest, RuntimeServiceManifest service, List<String> servicePorts, ResolvedRuntimeConfiguration runtimeConfiguration) {
        yaml.append("  ").append(service.name()).append(":\n");
        yaml.append("    image: ").append(service.image()).append("\n");
        yaml.append("    container_name: ").append(service.containerName()).append("\n");
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
        appendLabels(yaml, serviceLabels(manifest, service));
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
