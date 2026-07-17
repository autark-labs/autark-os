package com.autarkos.backups;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_backups")
public class RestorePointEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "app_id", nullable = false)
    private String appId;

    @Column(name = "app_name")
    private String appName;

    @Column(name = "backup_scope", nullable = false)
    private String scope;

    @Column(name = "backup_source", nullable = false)
    private String source;

    @Column(name = "included_app_ids")
    private String includedAppIds;

    @Column(name = "backup_path", nullable = false)
    private String path;

    @Column(nullable = false)
    private String status;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    private String message;

    @Column(name = "verification_status", nullable = false)
    private String verificationStatus;

    @Column(name = "verification_message")
    private String verificationMessage;

    @Column(name = "checksum_sha256")
    private String checksumSha256;

    @Column(name = "integrity_baseline_sha256")
    private String integrityBaselineSha256;

    @Column(name = "backup_contract_strategy", nullable = false)
    private String backupContractStrategy;

    @Column(name = "backup_contract_version", nullable = false)
    private int backupContractVersion;

    @Column(name = "restore_confidence", nullable = false)
    private String restoreConfidence;

    @Column(name = "verified_at")
    private String verifiedAt;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    protected RestorePointEntity() {
    }

    RestorePointEntity(String appId, String appName, String scope, String source, String includedAppIds, String path, String status, long sizeBytes, String message, String checksumSha256, String backupContractStrategy, int backupContractVersion, String createdAt) {
        this.appId = appId;
        this.appName = appName;
        this.scope = scope;
        this.source = source;
        this.includedAppIds = includedAppIds;
        this.path = path;
        this.status = status;
        this.sizeBytes = sizeBytes;
        this.message = message;
        this.verificationStatus = backupContractVersion < 1 && "completed".equals(status) ? "legacy_unverified" : "not_checked";
        this.verificationMessage = backupContractVersion < 1 && "completed".equals(status)
                ? "This restore point was created before Autark-OS recorded an immutable integrity baseline. Create a new backup before restoring."
                : "Backup has not been verified yet.";
        this.checksumSha256 = checksumSha256 == null ? "" : checksumSha256;
        this.integrityBaselineSha256 = checksumSha256 == null ? "" : checksumSha256;
        this.backupContractStrategy = backupContractStrategy == null || backupContractStrategy.isBlank() ? "legacy_unverified" : backupContractStrategy;
        this.backupContractVersion = Math.max(backupContractVersion, 0);
        this.restoreConfidence = "unknown";
        this.createdAt = createdAt;
    }

    Long id() {
        return id;
    }

    String appId() {
        return appId;
    }

    String appName() {
        return appName;
    }

    String scope() {
        return scope;
    }

    String source() {
        return source;
    }

    String includedAppIds() {
        return includedAppIds;
    }

    String path() {
        return path;
    }

    String status() {
        return status;
    }

    long sizeBytes() {
        return sizeBytes;
    }

    String message() {
        return message;
    }

    String verificationStatus() {
        return verificationStatus;
    }

    String verificationMessage() {
        return verificationMessage;
    }

    String checksumSha256() {
        return checksumSha256;
    }

    String integrityBaselineSha256() {
        return integrityBaselineSha256;
    }

    String backupContractStrategy() {
        return backupContractStrategy;
    }

    int backupContractVersion() {
        return backupContractVersion;
    }

    String restoreConfidence() {
        return restoreConfidence;
    }

    String verifiedAt() {
        return verifiedAt;
    }

    String createdAt() {
        return createdAt;
    }

    public void updateVerification(String verificationStatus, String verificationMessage, String restoreConfidence, String verifiedAt) {
        this.verificationStatus = verificationStatus;
        this.verificationMessage = verificationMessage;
        this.restoreConfidence = restoreConfidence;
        this.verifiedAt = verifiedAt;
    }
}
