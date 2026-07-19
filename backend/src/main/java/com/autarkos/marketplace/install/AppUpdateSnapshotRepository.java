package com.autarkos.marketplace.install;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface AppUpdateSnapshotRepository extends JpaRepository<AppUpdateSnapshotEntity, String> {

    List<AppUpdateSnapshotEntity> findByAppIdOrderByCreatedAtDesc(String appId);

    default Optional<AppUpdateSnapshot> latestRollbackFor(String appId) {
        return findByAppIdOrderByCreatedAtDesc(appId).stream()
                .filter(snapshot -> "rollback_available".equals(snapshot.status()))
                .findFirst()
                .map(AppUpdateSnapshots::toDomain);
    }

    default Optional<AppUpdateSnapshot> activeFor(String appId) {
        return findByAppIdOrderByCreatedAtDesc(appId).stream()
                .filter(snapshot -> "applying".equals(snapshot.status()) || "recovery_required".equals(snapshot.status()))
                .findFirst()
                .map(AppUpdateSnapshots::toDomain);
    }

    default AppUpdateSnapshot saveSnapshot(AppUpdateSnapshot snapshot) {
        return AppUpdateSnapshots.toDomain(save(new AppUpdateSnapshotEntity(snapshot)));
    }

    default void updateStatus(String snapshotId, String status, String message) {
        findById(snapshotId).ifPresent(snapshot -> {
            snapshot.updateStatus(status, message, java.time.Instant.now().toString());
            save(snapshot);
        });
    }
}
