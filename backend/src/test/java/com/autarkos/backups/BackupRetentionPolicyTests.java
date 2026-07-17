package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class BackupRetentionPolicyTests {

    @Test
    void countRetentionKeepsNewestVerifiedPointOutsideRequestedCount() {
        RestorePoint newestUnverified = point(3, "2026-07-15T12:00:00Z", "not_checked");
        RestorePoint newestVerified = point(2, "2026-07-14T12:00:00Z", "verified");
        RestorePoint olderVerified = point(1, "2026-07-13T12:00:00Z", "verified");

        assertThat(BackupRetentionPolicy.pruneByCount(List.of(newestUnverified, newestVerified, olderVerified), 1))
                .extracting(RestorePoint::id)
                .containsExactly(1L);
    }

    @Test
    void dayRetentionUsesAClockControlledCutoffAndPreservesRecoveryFloor() {
        RestorePoint recent = point(3, "2026-07-14T12:00:00Z", "not_checked");
        RestorePoint newestVerifiedButOld = point(2, "2026-06-01T12:00:00Z", "verified");
        RestorePoint old = point(1, "2026-05-01T12:00:00Z", "verified");

        assertThat(BackupRetentionPolicy.pruneBefore(
                List.of(recent, newestVerifiedButOld, old), Instant.parse("2026-07-01T00:00:00Z")))
                .extracting(RestorePoint::id)
                .containsExactly(1L);
    }

    private RestorePoint point(long id, String createdAt, String verificationStatus) {
        return new RestorePoint(id, "vaultwarden", "Vaultwarden", "app", "automatic", "vaultwarden", "completed", "/tmp/archive-" + id + ".zip", 1,
                "Backup completed.", verificationStatus, "", "", "", "cold_file", 1, "high", null, Instant.parse(createdAt));
    }
}
