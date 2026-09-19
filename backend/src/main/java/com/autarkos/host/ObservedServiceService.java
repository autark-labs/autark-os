package com.autarkos.host;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.model.ApplicationManifest;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ObservedServiceService {

    private final ObservedServiceRepository repository;
    private final ObservedServiceScanner scanner;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ObservedServiceService(
            ObservedServiceRepository repository,
            ObservedServiceScanner scanner) {
        this.repository = repository;
        this.scanner = scanner;
    }

    public void refresh(DockerInventorySnapshot inventory) {
        Instant now = inventory.capturedAt();
        List<ObservedService> scannedServices = scanner.scan(inventory, now);
        for (ObservedService scanned : scannedServices) {
            ObservedService merged = repository.findServiceBySourceAndFingerprint(scanned.source(), scanned.fingerprint())
                    .map(existing -> merge(existing, scanned))
                    .orElse(scanned);
            repository.upsert(merged);
        }
        List<String> dockerFingerprints = scannedServices.stream()
                .filter(service -> HostModels.ObservedServiceSource.DOCKER.equals(service.source()))
                .map(ObservedService::fingerprint)
                .filter(fingerprint -> fingerprint != null && !fingerprint.isBlank())
                .distinct()
                .toList();
        repository.deleteDockerServicesNotIn(dockerFingerprints);
    }

    public List<ObservedService> observedServices() {
        return repository.findAllServices().stream()
                .filter(this::activeEvidence)
                .toList();
    }

    public List<ObservedService> servicesForCatalogApp(String appId) {
        return observedServices().stream()
                .filter(service -> appId.equals(service.catalogAppId()))
                .filter(ObservedService::catalogIdentityExplicit)
                .toList();
    }

    public void recordFailedInstall(ApplicationManifest manifest, String accessUrl, String runtimePath, String composeProject, String message, List<String> logs, String instanceId) {
        if (manifest == null) {
            return;
        }
        Instant now = Instant.now();
        repository.upsert(new ObservedService(
                "autark-os-install:" + manifest.id(),
                HostModels.ObservedServiceSource.AUTARK_OS_INSTALL,
                manifest.id(),
                manifest.name(),
                cleanToNull(accessUrl),
                "LAN",
                manifest.id(),
                "autark_os_failed_install",
                "failed_install",
                "failed",
                cleanToNull(instanceId),
                now,
                now,
                failedInstallMetadata(runtimePath, composeProject, message, logs)));
    }

    public void clearFailedInstall(String catalogAppId) {
        if (catalogAppId == null || catalogAppId.isBlank()) {
            return;
        }
        repository.deleteFailedInstall(catalogAppId);
    }

    private ObservedService merge(ObservedService existing, ObservedService scanned) {
        return new ObservedService(
                existing.id(),
                existing.source(),
                existing.fingerprint(),
                scanned.displayName(),
                scanned.url(),
                scanned.accessScope(),
                scanned.catalogAppId(),
                scanned.catalogMatchConfidence(),
                scanned.ownershipState(),
                scanned.runtimeState(),
                scanned.autarkOsInstanceId(),
                existing.firstSeenAt(),
                scanned.lastSeenAt(),
                scanned.metadataJson());
    }

    private boolean activeEvidence(ObservedService service) {
        return HostModels.ObservedServiceSource.DOCKER.equals(service.source())
                || HostModels.ObservedServiceSource.AUTARK_OS_INSTALL.equals(service.source());
    }

    private String failedInstallMetadata(String runtimePath, String composeProject, String message, List<String> logs) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("runtimePath", blankDefault(runtimePath, ""));
        metadata.put("composeProject", blankDefault(composeProject, ""));
        metadata.put("failureMessage", blankDefault(message, "Install failed after Autark-OS started creating runtime resources."));
        metadata.put("logTail", logs == null ? List.of() : logs.stream().skip(Math.max(0, logs.size() - 20)).toList());
        try {
            return objectMapper.writeValueAsString(metadata);
        } catch (java.io.IOException exception) {
            return "{}";
        }
    }

    private static String cleanToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String blankDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
