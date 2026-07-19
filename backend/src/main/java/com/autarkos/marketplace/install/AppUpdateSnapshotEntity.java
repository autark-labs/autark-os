package com.autarkos.marketplace.install;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_update_snapshots")
class AppUpdateSnapshotEntity {

    @Id
    @Column(name = "snapshot_id")
    private String snapshotId;

    @Column(name = "app_id")
    private String appId;

    @Column(name = "app_name")
    private String appName;

    @Column(name = "operation_kind")
    private String operationKind;

    @Column(name = "from_version")
    private String fromVersion;

    @Column(name = "to_version")
    private String toVersion;

    @Column(name = "snapshot_path")
    private String snapshotPath;

    @Column(name = "safety_restore_point_id")
    private Long safetyRestorePointId;

    @Column(name = "status")
    private String status;

    @Column(name = "message")
    private String message;

    @Column(name = "created_at")
    private String createdAt;

    @Column(name = "updated_at")
    private String updatedAt;

    protected AppUpdateSnapshotEntity() {
    }

    AppUpdateSnapshotEntity(AppUpdateSnapshot snapshot) {
        this.snapshotId = snapshot.snapshotId();
        this.appId = snapshot.appId();
        this.appName = snapshot.appName();
        this.operationKind = snapshot.operationKind();
        this.fromVersion = snapshot.fromVersion();
        this.toVersion = snapshot.toVersion();
        this.snapshotPath = snapshot.snapshotPath();
        this.safetyRestorePointId = snapshot.safetyRestorePointId();
        this.status = snapshot.status();
        this.message = snapshot.message();
        this.createdAt = snapshot.createdAt().toString();
        this.updatedAt = snapshot.updatedAt().toString();
    }

    void updateStatus(String status, String message, String updatedAt) {
        this.status = status;
        this.message = message == null ? "" : message;
        this.updatedAt = updatedAt;
    }

    String snapshotId() { return snapshotId; }
    String appId() { return appId; }
    String appName() { return appName; }
    String operationKind() { return operationKind; }
    String fromVersion() { return fromVersion; }
    String toVersion() { return toVersion; }
    String snapshotPath() { return snapshotPath; }
    Long safetyRestorePointId() { return safetyRestorePointId; }
    String status() { return status; }
    String message() { return message; }
    String createdAt() { return createdAt; }
    String updatedAt() { return updatedAt; }
}
