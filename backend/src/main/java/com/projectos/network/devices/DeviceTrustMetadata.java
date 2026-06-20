package com.projectos.network.devices;

import java.time.Instant;

public record DeviceTrustMetadata(
        String deviceId,
        String nickname,
        String trustGroup,
        boolean trusted,
        String notes,
        Instant updatedAt) {
}
