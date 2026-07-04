package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.install.models.RuntimeModels;

@Service
public class AppTelemetryService {

    private final DockerComposeExecutor composeExecutor;
    private final AppRuntimeStatusResolver runtimeStatusResolver = new AppRuntimeStatusResolver();

    public AppTelemetryService(DockerComposeExecutor composeExecutor) {
        this.composeExecutor = composeExecutor;
    }

    public RuntimeModels.AppTelemetry telemetry(InstalledApp app) {
        List<RuntimeModels.DockerContainerStatus> containers = composeExecutor.containers(composeFile(app), app.composeProject());
        return telemetryForContainers(containers);
    }

    public Map<String, RuntimeModels.AppTelemetry> telemetryForApps(List<InstalledApp> apps) {
        Map<String, List<String>> containerNamesByAppId = new LinkedHashMap<>();
        for (InstalledApp app : apps) {
            List<String> names = runtimeStatusResolver.containerNames(composeExecutor.containers(composeFile(app), app.composeProject()));
            containerNamesByAppId.put(app.appId(), names);
        }
        List<String> containerNames = containerNamesByAppId.values().stream()
                .flatMap(List::stream)
                .toList();
        Map<String, RuntimeModels.ContainerTelemetry> telemetryByContainerName = new LinkedHashMap<>();
        for (RuntimeModels.ContainerTelemetry telemetry : composeExecutor.stats(containerNames)) {
            telemetryByContainerName.put(telemetry.containerName(), telemetry);
        }
        Map<String, RuntimeModels.AppTelemetry> telemetryByAppId = new LinkedHashMap<>();
        containerNamesByAppId.forEach((appId, names) -> telemetryByAppId.put(appId, RuntimeModels.AppTelemetry.from(names.stream()
                .map(telemetryByContainerName::get)
                .filter(java.util.Objects::nonNull)
                .toList())));
        return telemetryByAppId;
    }

    public RuntimeModels.AppTelemetry telemetryForContainers(List<RuntimeModels.DockerContainerStatus> containers) {
        return RuntimeModels.AppTelemetry.from(composeExecutor.stats(runtimeStatusResolver.containerNames(containers)));
    }

    private Path composeFile(InstalledApp app) {
        return Path.of(app.runtimePath()).resolve("compose.yaml");
    }
}
