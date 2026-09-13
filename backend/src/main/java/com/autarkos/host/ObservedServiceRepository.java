package com.autarkos.host;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ObservedServiceRepository extends JpaRepository<ObservedServiceEntity, String> {

    Optional<ObservedServiceEntity> findBySourceAndFingerprint(String source, String fingerprint);

    List<ObservedServiceEntity> findBySource(String source);

    List<ObservedServiceEntity> findByCatalogAppIdAndSourceAndOwnershipState(String catalogAppId, String source, String ownershipState);

    default List<ObservedService> findAllServices() {
        return findAll().stream()
                .map(ObservedServices::service)
                .sorted(java.util.Comparator.comparing(ObservedService::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    default Optional<ObservedService> findServiceById(String id) {
        return findById(id).map(ObservedServices::service);
    }

    default Optional<ObservedService> findServiceBySourceAndFingerprint(String source, String fingerprint) {
        return findBySourceAndFingerprint(source, fingerprint).map(ObservedServices::service);
    }

    default void upsert(ObservedService service) {
        ObservedServiceEntity entity = findBySourceAndFingerprint(service.source(), service.fingerprint())
                .orElseGet(() -> ObservedServices.entity(service));
        entity.updateFrom(service);
        save(entity);
    }

    default void deleteFailedInstall(String catalogAppId) {
        deleteAll(findByCatalogAppIdAndSourceAndOwnershipState(catalogAppId, HostModels.ObservedServiceSource.AUTARK_OS_INSTALL, "failed_install"));
    }

    default void deleteDockerServicesNotIn(Collection<String> fingerprints) {
        if (fingerprints == null || fingerprints.isEmpty()) {
            return;
        }
        Collection<String> currentFingerprints = fingerprints == null ? List.of() : fingerprints;
        List<ObservedServiceEntity> stale = findBySource(HostModels.ObservedServiceSource.DOCKER).stream()
                .filter(entity -> !currentFingerprints.contains(entity.fingerprint()))
                .toList();
        deleteAll(stale);
    }
}
