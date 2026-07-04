package com.autarkos.network.devices;

import java.time.Instant;

final class DeviceTrustRecords {

    private DeviceTrustRecords() {
    }

    static DeviceTrustEntity entity(DeviceTrustMetadata metadata) {
        return new DeviceTrustEntity(
                metadata.deviceId(),
                metadata.nickname(),
                metadata.trustGroup(),
                metadata.trusted(),
                metadata.notes(),
                metadata.updatedAt().toString());
    }

    static DeviceTrustMetadata metadata(DeviceTrustEntity entity) {
        return new DeviceTrustMetadata(
                entity.deviceId(),
                entity.nickname(),
                entity.trustGroup(),
                entity.trusted(),
                entity.notes(),
                Instant.parse(entity.updatedAt()));
    }

    static String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
