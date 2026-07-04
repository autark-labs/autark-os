package com.autarkos.host;

import java.time.Instant;

final class ObservedServices {

    private ObservedServices() {
    }

    static ObservedServiceEntity entity(ObservedService service) {
        return new ObservedServiceEntity(service);
    }

    static ObservedService service(ObservedServiceEntity entity) {
        return new ObservedService(
                entity.id(),
                entity.source(),
                entity.fingerprint(),
                entity.displayName(),
                entity.url(),
                entity.category(),
                entity.accessScope(),
                entity.catalogAppId(),
                entity.catalogMatchConfidence(),
                entity.ownershipState(),
                entity.userVisibility(),
                entity.runtimeState(),
                entity.healthCheckEnabled(),
                entity.autarkOsInstanceId(),
                Instant.parse(entity.firstSeenAt()),
                Instant.parse(entity.lastSeenAt()),
                instant(entity.pinnedAt()),
                instant(entity.ignoredAt()),
                entity.metadataJson());
    }

    private static Instant instant(String value) {
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }
}
