package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

@Service
public class AppTelemetryService {

    private final DockerComposeExecutor composeExecutor;
    private final AppRuntimeStatusResolver runtimeStatusResolver = new AppRuntimeStatusResolver();

    public AppTelemetryService(DockerComposeExecutor composeExecutor) {
        this.composeExecutor = composeExecutor;
    }

    public AppTelemetry telemetry(InstalledApp app) {
        List<DockerContainerStatus> containers = composeExecutor.containers(composeFile(app), app.composeProject());
        return telemetryForContainers(containers);
    }

    public Map<String, AppTelemetry> telemetryForApps(List<InstalledApp> apps) {
        Map<String, List<String>> containerNamesByAppId = new LinkedHashMap<>();
        for (InstalledApp app : apps) {
            List<String> names = runtimeStatusResolver.containerNames(composeExecutor.containers(composeFile(app), app.composeProject()));
            containerNamesByAppId.put(app.appId(), names);
        }
        List<String> containerNames = containerNamesByAppId.values().stream()
                .flatMap(List::stream)
                .toList();
        Map<String, ContainerTelemetry> telemetryByContainerName = new LinkedHashMap<>();
        for (ContainerTelemetry telemetry : composeExecutor.stats(containerNames)) {
            telemetryByContainerName.put(telemetry.containerName(), telemetry);
        }
        Map<String, AppTelemetry> telemetryByAppId = new LinkedHashMap<>();
        containerNamesByAppId.forEach((appId, names) -> telemetryByAppId.put(appId, AppTelemetry.from(names.stream()
                .map(telemetryByContainerName::get)
                .filter(java.util.Objects::nonNull)
                .toList())));
        return telemetryByAppId;
    }

    public AppTelemetry telemetryForContainers(List<DockerContainerStatus> containers) {
        return AppTelemetry.from(composeExecutor.stats(runtimeStatusResolver.containerNames(containers)));
    }

    private Path composeFile(InstalledApp app) {
        return Path.of(app.runtimePath()).resolve("compose.yaml");
    }
}
