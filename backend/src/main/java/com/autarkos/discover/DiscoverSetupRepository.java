package com.autarkos.discover;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DiscoverSetupRepository extends JpaRepository<DiscoverSetupEntity, String> {

    default void save(String appId, String catalogAppId, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        Instant now = Instant.now();
        Instant createdAt = findById(appId)
                .map(DiscoverSetupEntity::createdAt)
                .map(Instant::parse)
                .orElse(now);
        save(DiscoverSetupRecords.entity(appId, catalogAppId, answers, createdAt, now));
    }

    default Optional<DiscoverSetupModels.DiscoverSetupRecord> recordByAppId(String appId) {
        return findById(appId).map(DiscoverSetupRecords::record);
    }
}
