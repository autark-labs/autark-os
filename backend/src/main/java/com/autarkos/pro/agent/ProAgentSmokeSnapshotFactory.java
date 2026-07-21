package com.autarkos.pro.agent;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.autarkos.pro.model.NormalizedHostSnapshot;

@Component
public final class ProAgentSmokeSnapshotFactory {

    public NormalizedHostSnapshot create(
            String coreVersion,
            String architecture,
            Instant now) {
        return new NormalizedHostSnapshot(
                "1",
                UUID.randomUUID().toString(),
                now,
                new NormalizedHostSnapshot.SystemSnapshot(
                        coreVersion,
                        architecture,
                        "available",
                        "unknown"),
                List.of(),
                new NormalizedHostSnapshot.FoundServicesSnapshot(
                        0,
                        0,
                        0,
                        0,
                        List.of()),
                List.of(),
                new NormalizedHostSnapshot.BackupSnapshot(
                        "unavailable",
                        new NormalizedHostSnapshot
                                .BackupDestinationSnapshot(
                                        null,
                                        "unavailable"),
                        List.of()),
                new NormalizedHostSnapshot.StorageSnapshot(
                        "unavailable",
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        List.of(),
                        null),
                new NormalizedHostSnapshot.MetricsSnapshot(
                        "unavailable",
                        null,
                        null,
                        null),
                List.of(),
                List.of(),
                List.of(),
                true);
    }
}
