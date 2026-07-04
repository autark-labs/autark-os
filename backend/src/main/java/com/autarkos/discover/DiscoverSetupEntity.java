package com.autarkos.discover;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "discover_app_setup_answers")
class DiscoverSetupEntity {

    @Id
    @Column(name = "app_id")
    private String appId;

    @Column(name = "catalog_app_id", nullable = false)
    private String catalogAppId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "access_mode", nullable = false)
    private String accessMode;

    @Column(name = "storage_mode", nullable = false)
    private String storageMode;

    @Column(name = "backup_policy", nullable = false)
    private String backupPolicy;

    @Column(name = "local_browser_port", nullable = false)
    private String localBrowserPort;

    @Column(name = "answers_json", nullable = false)
    private String answersJson;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    @Column(name = "updated_at", nullable = false)
    private String updatedAt;

    protected DiscoverSetupEntity() {
    }

    DiscoverSetupEntity(String appId, String catalogAppId, String displayName, String accessMode, String storageMode, String backupPolicy, String localBrowserPort, String answersJson, String createdAt, String updatedAt) {
        this.appId = appId;
        this.catalogAppId = catalogAppId;
        this.displayName = displayName;
        this.accessMode = accessMode;
        this.storageMode = storageMode;
        this.backupPolicy = backupPolicy;
        this.localBrowserPort = localBrowserPort;
        this.answersJson = answersJson;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    String appId() {
        return appId;
    }

    String catalogAppId() {
        return catalogAppId;
    }

    String displayName() {
        return displayName;
    }

    String accessMode() {
        return accessMode;
    }

    String storageMode() {
        return storageMode;
    }

    String backupPolicy() {
        return backupPolicy;
    }

    String localBrowserPort() {
        return localBrowserPort;
    }

    String answersJson() {
        return answersJson;
    }

    String createdAt() {
        return createdAt;
    }

    String updatedAt() {
        return updatedAt;
    }
}
