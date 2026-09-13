package com.autarkos.host;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.system.AutarkOsIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ObservedServiceService {

    private final ObservedServiceRepository repository;
    private final ObservedServiceScanner scanner;
    private final Supplier<AutarkOsIdentity> currentIdentity;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public ObservedServiceService(
            ObservedServiceRepository repository,
            ObservedServiceScanner scanner,
            DockerOwnershipService ownershipService) {
        this.repository = repository;
        this.scanner = scanner;
        this.currentIdentity = ownershipService::currentIdentity;
    }

    public ObservedServiceService(ObservedServiceRepository repository, ObservedServiceScanner scanner) {
        this(repository, scanner, () -> new AutarkOsIdentity("", "autark-os", "", "", Instant.EPOCH, 1));
    }

    protected ObservedServiceService() {
        this(null, null, () -> new AutarkOsIdentity("", "autark-os", "", "", Instant.EPOCH, 1));
    }

    private ObservedServiceService(
            ObservedServiceRepository repository,
            ObservedServiceScanner scanner,
            Supplier<AutarkOsIdentity> currentIdentity) {
        this.repository = repository;
        this.scanner = scanner;
        this.currentIdentity = currentIdentity;
    }

    public void refresh() {
        Instant now = Instant.now();
        if (scanner != null) {
            List<ObservedService> scannedServices = scanner.scan(now);
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
    }

    public List<ObservedService> observedServices() {
        return repository.findAllServices().stream()
                .filter(this::activeEvidence)
                .toList();
    }

    public List<ObservedService> matchingCatalogServices(String appId) {
        String normalized = normalizeToken(appId);
        return observedServices().stream()
                .filter(service -> appId.equals(service.catalogAppId()) || (service.catalogAppId() == null && matchesNameOrUrl(service, normalized)))
                .toList();
    }

    public void recordFailedInstall(ApplicationManifest manifest, String accessUrl, String runtimePath, String composeProject, String message, List<String> logs) {
        if (repository == null || manifest == null) {
            return;
        }
        Instant now = Instant.now();
        AutarkOsIdentity identity = currentIdentity.get();
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
                identity.instanceId(),
                now,
                now,
                failedInstallMetadata(runtimePath, composeProject, message, logs)));
    }

    public void clearFailedInstall(String catalogAppId) {
        if (repository == null || catalogAppId == null || catalogAppId.isBlank()) {
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

    private boolean matchesNameOrUrl(ObservedService service, String normalizedAppId) {
        if (normalizedAppId.isBlank()) {
            return false;
        }
        return normalizeToken(service.displayName()).contains(normalizedAppId)
                || normalizeToken(service.url()).contains(normalizedAppId);
    }

    private static String normalizeToken(String value) {
        return value == null ? "" : value.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", "");
    }

    private static String cleanToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String blankDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
