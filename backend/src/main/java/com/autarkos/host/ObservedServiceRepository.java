package com.autarkos.host;

import java.time.Instant;
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

    default boolean pin(String id, Instant now) {
        return findById(id)
                .map(entity -> {
                    entity.pin(now.toString());
                    save(entity);
                    return true;
                })
                .orElse(false);
    }

    default boolean unpin(String id) {
        return findById(id)
                .map(entity -> {
                    entity.unpin();
                    save(entity);
                    return true;
                })
                .orElse(false);
    }

    default boolean updateCatalogMatch(String id, String catalogAppId, String confidence) {
        return findById(id)
                .map(entity -> {
                    entity.updateCatalogMatch(catalogAppId, confidence);
                    save(entity);
                    return true;
                })
                .orElse(false);
    }

    default boolean markManaged(String id, String autarkOsInstanceId, Instant now) {
        return findById(id)
                .map(entity -> {
                    entity.markManaged(autarkOsInstanceId, now.toString());
                    save(entity);
                    return true;
                })
                .orElse(false);
    }

    default void deleteFailedInstall(String catalogAppId) {
        deleteAll(findByCatalogAppIdAndSourceAndOwnershipState(catalogAppId, HostModels.ObservedServiceSource.AUTARK_OS_INSTALL, "failed_install"));
    }

    default void deleteUnpinnedDockerServicesNotIn(Collection<String> fingerprints) {
        if (fingerprints == null || fingerprints.isEmpty()) {
            return;
        }
        List<ObservedServiceEntity> stale = findBySource(HostModels.ObservedServiceSource.DOCKER).stream()
                .filter(entity -> !"pinned".equals(entity.userVisibility()))
                .filter(entity -> !fingerprints.contains(entity.fingerprint()))
                .toList();
        deleteAll(stale);
    }
}
