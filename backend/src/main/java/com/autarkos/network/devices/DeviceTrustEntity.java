package com.autarkos.network.devices;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "device_trust_metadata")
class DeviceTrustEntity {

    @Id
    @Column(name = "device_id")
    private String deviceId;

    @Column(name = "nickname", nullable = false)
    private String nickname;

    @Column(name = "trust_group", nullable = false)
    private String trustGroup;

    @Column(name = "trusted", nullable = false)
    private boolean trusted;

    @Column(name = "notes", nullable = false)
    private String notes;

    @Column(name = "updated_at", nullable = false)
    private String updatedAt;

    protected DeviceTrustEntity() {
    }

    DeviceTrustEntity(String deviceId, String nickname, String trustGroup, boolean trusted, String notes, String updatedAt) {
        this.deviceId = deviceId;
        this.nickname = nickname;
        this.trustGroup = trustGroup;
        this.trusted = trusted;
        this.notes = notes;
        this.updatedAt = updatedAt;
    }

    String deviceId() {
        return deviceId;
    }

    String nickname() {
        return nickname;
    }

    String trustGroup() {
        return trustGroup;
    }

    boolean trusted() {
        return trusted;
    }

    String notes() {
        return notes;
    }

    String updatedAt() {
        return updatedAt;
    }
}
