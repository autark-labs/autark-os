package com.autarkos.pro;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.autarkos.pro.models.ProModels;

public interface ProSettingsRepository extends JpaRepository<ProSettingsEntity, Integer> {

    default Optional<ProModels.ProSettings> settings() {
        return findById(ProSettingsEntity.SINGLETON_ID).map(ProSettingsEntity::settings);
    }

    default void saveSettings(ProModels.ProSettings settings) {
        ProSettingsEntity entity = findById(ProSettingsEntity.SINGLETON_ID)
                .orElseGet(() -> new ProSettingsEntity(settings));
        entity.updateFrom(settings);
        save(entity);
    }
}
