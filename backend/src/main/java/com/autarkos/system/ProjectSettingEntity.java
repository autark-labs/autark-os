package com.autarkos.system;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "project_settings")
class ProjectSettingEntity {

    @Id
    @Column(name = "setting_key")
    private String settingKey;

    @Column(name = "setting_value", nullable = false)
    private String settingValue;

    @Column(name = "updated_at", nullable = false)
    private String updatedAt;

    protected ProjectSettingEntity() {
    }

    ProjectSettingEntity(String settingKey, String settingValue, String updatedAt) {
        this.settingKey = settingKey;
        this.settingValue = settingValue;
        this.updatedAt = updatedAt;
    }

    String settingKey() {
        return settingKey;
    }

    String settingValue() {
        return settingValue;
    }
}
