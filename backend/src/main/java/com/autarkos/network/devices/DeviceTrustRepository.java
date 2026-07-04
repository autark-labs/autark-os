package com.autarkos.network.devices;

import java.time.Instant;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.data.jpa.repository.JpaRepository;

import com.autarkos.network.api.DeviceTrustUpdateRequest;

public interface DeviceTrustRepository extends JpaRepository<DeviceTrustEntity, String> {

    default Map<String, DeviceTrustMetadata> metadataByDeviceId() {
        return findAll().stream()
                .map(DeviceTrustRecords::metadata)
                .collect(Collectors.toMap(DeviceTrustMetadata::deviceId, metadata -> metadata));
    }

    default DeviceTrustMetadata upsert(String deviceId, DeviceTrustUpdateRequest request) {
        DeviceTrustMetadata metadata = new DeviceTrustMetadata(
                DeviceTrustRecords.clean(deviceId, "unknown"),
                DeviceTrustRecords.clean(request.nickname(), ""),
                DeviceTrustRecords.clean(request.trustGroup(), "Personal devices"),
                request.trusted() == null || request.trusted(),
                DeviceTrustRecords.clean(request.notes(), ""),
                Instant.now());
        return DeviceTrustRecords.metadata(save(DeviceTrustRecords.entity(metadata)));
    }
}
