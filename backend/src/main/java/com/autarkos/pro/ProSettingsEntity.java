package com.autarkos.pro;

import java.time.Instant;

import com.autarkos.pro.models.ProModels;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "pro_settings")
class ProSettingsEntity {

    static final int SINGLETON_ID = 1;

    @Id
    @Column(name = "id")
    private Integer id;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "mode", nullable = false)
    private String mode;

    @Column(name = "install_id")
    private String installId;

    @Column(name = "install_token_protected")
    private String installTokenProtected;

    @Column(name = "account_linked", nullable = false)
    private boolean accountLinked;

    @Column(name = "account_email")
    private String accountEmail;

    @Column(name = "plan")
    private String plan;

    @Column(name = "entitlement_status", nullable = false)
    private String entitlementStatus;

    @Column(name = "entitlement_expires_at")
    private String entitlementExpiresAt;

    @Column(name = "health_reporting_enabled", nullable = false)
    private boolean healthReportingEnabled;

    @Column(name = "alerts_enabled", nullable = false)
    private boolean alertsEnabled;

    @Column(name = "pro_feed_enabled", nullable = false)
    private boolean proFeedEnabled;

    @Column(name = "config_snapshot_enabled", nullable = false)
    private boolean configSnapshotEnabled;

    @Column(name = "last_heartbeat_at")
    private String lastHeartbeatAt;

    @Column(name = "last_heartbeat_result")
    private String lastHeartbeatResult;

    @Column(name = "last_entitlement_check_at")
    private String lastEntitlementCheckAt;

    @Column(name = "last_feed_sync_at")
    private String lastFeedSyncAt;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    @Column(name = "updated_at", nullable = false)
    private String updatedAt;

    protected ProSettingsEntity() {
    }

    ProSettingsEntity(ProModels.ProSettings settings) {
        this.id = SINGLETON_ID;
        updateFrom(settings);
    }

    void updateFrom(ProModels.ProSettings settings) {
        this.enabled = settings.enabled();
        this.mode = settings.mode();
        this.installId = settings.installId();
        this.installTokenProtected = settings.installTokenProtected();
        this.accountLinked = settings.accountLinked();
        this.accountEmail = settings.accountEmail();
        this.plan = settings.plan();
        this.entitlementStatus = settings.entitlementStatus();
        this.entitlementExpiresAt = encode(settings.entitlementExpiresAt());
        this.healthReportingEnabled = settings.healthReportingEnabled();
        this.alertsEnabled = settings.alertsEnabled();
        this.proFeedEnabled = settings.proFeedEnabled();
        this.configSnapshotEnabled = settings.configSnapshotEnabled();
        this.lastHeartbeatAt = encode(settings.lastHeartbeatAt());
        this.lastHeartbeatResult = settings.lastHeartbeatResult();
        this.lastEntitlementCheckAt = encode(settings.lastEntitlementCheckAt());
        this.lastFeedSyncAt = encode(settings.lastFeedSyncAt());
        this.createdAt = encode(settings.createdAt());
        this.updatedAt = encode(settings.updatedAt());
    }

    ProModels.ProSettings settings() {
        return new ProModels.ProSettings(
                enabled,
                mode,
                installId,
                installTokenProtected,
                accountLinked,
                accountEmail,
                plan,
                entitlementStatus,
                decode(entitlementExpiresAt),
                healthReportingEnabled,
                alertsEnabled,
                proFeedEnabled,
                configSnapshotEnabled,
                decode(lastHeartbeatAt),
                lastHeartbeatResult,
                decode(lastEntitlementCheckAt),
                decode(lastFeedSyncAt),
                decode(createdAt),
                decode(updatedAt));
    }

    private static String encode(Instant instant) {
        return instant == null ? null : instant.toString();
    }

    private static Instant decode(String value) {
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }
}
