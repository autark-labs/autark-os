package com.autarkos.system;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_storage_samples")
public class StorageSampleEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "app_id", nullable = false)
    private String appId;

    @Column(name = "used_bytes", nullable = false)
    private long usedBytes;

    @Column(name = "sampled_at", nullable = false)
    private String sampledAt;

    protected StorageSampleEntity() {
    }

    public StorageSampleEntity(String appId, long usedBytes, String sampledAt) {
        this.appId = appId;
        this.usedBytes = usedBytes;
        this.sampledAt = sampledAt;
    }

    public long usedBytes() {
        return usedBytes;
    }

    public String sampledAt() {
        return sampledAt;
    }
}
