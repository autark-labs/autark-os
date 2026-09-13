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
                entity.accessScope(),
                entity.catalogAppId(),
                entity.catalogMatchConfidence(),
                entity.ownershipState(),
                entity.runtimeState(),
                entity.autarkOsInstanceId(),
                Instant.parse(entity.firstSeenAt()),
                Instant.parse(entity.lastSeenAt()),
                entity.metadataJson());
    }
}
