package com.autarkos.marketplace.install.models;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.autarkos.marketplace.install.DockerResourceOwnership;

public final class RuntimeModels {

    private RuntimeModels() {
    }

    public record AppRuntimeMetadata(
            String appInstanceId,
            String catalogAppId,
            String instanceId,
            String composeProject,
            String manifestVersion,
            Instant createdAt) {
    }

    public record AppTelemetry(
            String cpuPercent,
            String memoryUsage,
            String memoryPercent,
            String networkIo,
            String blockIo,
            Instant checkedAt) {

        public static AppTelemetry unavailable() {
            return new AppTelemetry("Unavailable", "Unavailable", "Unavailable", "Unavailable", "Unavailable", Instant.now());
        }

        public static AppTelemetry from(List<ContainerTelemetry> containers) {
            if (containers == null || containers.isEmpty()) {
                return unavailable();
            }
            ContainerTelemetry primary = containers.get(0);
            return new AppTelemetry(
                    value(primary.cpuPercent()),
                    value(primary.memoryUsage()),
                    value(primary.memoryPercent()),
                    value(primary.networkIo()),
                    value(primary.blockIo()),
                    Instant.now());
        }

        private static String value(String value) {
            return value == null || value.isBlank() ? "Unavailable" : value;
        }
    }

    public record ContainerTelemetry(
            String containerName,
            String cpuPercent,
            String memoryUsage,
            String memoryPercent,
            String networkIo,
            String blockIo) {
    }

    public record DockerComposeResult(int exitCode, List<String> output) {
        public boolean successful() {
            return exitCode == 0;
        }
    }

    public record DockerContainerStatus(
            String name,
            String service,
            String state,
            String health,
            String status,
            String ports) {
    }

    public record DockerResourceClassification(
            DockerResourceOwnership ownership,
            String appId,
            String appInstanceId,
            String composeProject) {
    }

    public record InstalledAppOwnershipMetadata(
            String appId,
            String appInstanceId,
            String catalogAppId,
            String autarkOsInstanceId,
            String runtimePathOrHash,
            String installState,
            String ownershipStatus,
            Instant createdAt,
            Instant updatedAt) {
    }

    public record ManagedContainer(
            String appId,
            String containerName,
            String status,
            DockerResourceOwnership ownership,
            String appInstanceId,
            String composeProject) {

        public ManagedContainer(String appId, String containerName, String status) {
            this(appId, containerName, status, DockerResourceOwnership.OWNED, "", "");
        }
    }

    public record ResolvedRuntimeConfiguration(
            List<String> ports,
            Map<String, List<String>> servicePorts,
            String accessUrl,
            String privateAccessUrl,
            Map<String, String> storageSubfolders,
            Map<String, String> storageHostPaths,
            boolean tailscaleEnabled,
            InstallModels.BackupPolicy backup) {

        public ResolvedRuntimeConfiguration(List<String> ports, String accessUrl) {
            this(ports, Map.of(), accessUrl, null, Map.of(), Map.of(), false, InstallModels.BackupPolicy.defaults());
        }

        public List<String> portsFor(String serviceName) {
            return servicePorts.getOrDefault(serviceName, List.of());
        }
    }
}
