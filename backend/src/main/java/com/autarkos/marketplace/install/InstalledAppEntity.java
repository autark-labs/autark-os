package com.autarkos.marketplace.install;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "installed_apps")
public class InstalledAppEntity {

    @Id
    @Column(name = "app_id")
    private String appId;

    @Column(name = "app_name")
    private String appName;

    @Column(name = "status")
    private String status;

    @Column(name = "runtime_path")
    private String runtimePath;

    @Column(name = "compose_project")
    private String composeProject;

    @Column(name = "access_url")
    private String accessUrl;

    @Column(name = "installed_at")
    private String installedAt;

    @Column(name = "app_instance_id")
    private String appInstanceId;

    @Column(name = "catalog_app_id")
    private String catalogAppId;

    @Column(name = "autark_os_instance_id")
    private String autarkOsInstanceId;

    @Column(name = "runtime_path_or_hash")
    private String runtimePathOrHash;

    @Column(name = "install_state")
    private String installState;

    @Column(name = "ownership_status")
    private String ownershipStatus;

    @Column(name = "created_at")
    private String createdAt;

    @Column(name = "updated_at")
    private String updatedAt;

    protected InstalledAppEntity() {
    }

    InstalledAppEntity(InstalledApp app, String now) {
        this.appId = app.appId();
        this.catalogAppId = app.appId();
        this.runtimePathOrHash = app.runtimePath();
        this.installState = app.status();
        this.ownershipStatus = "ownership_uncertain";
        this.createdAt = app.installedAt().toString();
        this.updatedAt = now;
        this.appInstanceId = "";
        this.autarkOsInstanceId = "";
        updateFrom(app, now);
    }

    void updateFrom(InstalledApp app, String now) {
        this.appId = app.appId();
        this.appName = app.appName();
        this.status = app.status();
        this.runtimePath = app.runtimePath();
        this.composeProject = app.composeProject();
        this.accessUrl = app.accessUrl();
        this.installedAt = app.installedAt().toString();
        this.updatedAt = now;
    }

    void updateOwnership(RuntimeModels.InstalledAppOwnershipMetadata metadata) {
        this.appInstanceId = metadata.appInstanceId();
        this.catalogAppId = metadata.catalogAppId();
        this.autarkOsInstanceId = metadata.autarkOsInstanceId();
        this.runtimePathOrHash = metadata.runtimePathOrHash();
        this.installState = metadata.installState();
        this.ownershipStatus = metadata.ownershipStatus();
        this.createdAt = metadata.createdAt().toString();
        this.updatedAt = metadata.updatedAt().toString();
    }

    String appId() {
        return appId;
    }

    String appName() {
        return appName;
    }

    String status() {
        return status;
    }

    String runtimePath() {
        return runtimePath;
    }

    String composeProject() {
        return composeProject;
    }

    String accessUrl() {
        return accessUrl;
    }

    String installedAt() {
        return installedAt;
    }

    String appInstanceId() {
        return appInstanceId;
    }

    String catalogAppId() {
        return catalogAppId;
    }

    String autarkOsInstanceId() {
        return autarkOsInstanceId;
    }

    String runtimePathOrHash() {
        return runtimePathOrHash;
    }

    String installState() {
        return installState;
    }

    String ownershipStatus() {
        return ownershipStatus;
    }

    String createdAt() {
        return createdAt;
    }

    String updatedAt() {
        return updatedAt;
    }
}
