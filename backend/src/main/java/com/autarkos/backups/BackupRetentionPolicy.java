package com.autarkos.backups;

import java.time.Instant;
import java.util.List;

import com.autarkos.api.AutarkOsStates;

/** Pure selection rules for archives that may be removed after a successful backup. */
final class BackupRetentionPolicy {

    private BackupRetentionPolicy() {
    }

    /**
     * The input must be newest first. Keep the requested number and always keep
     * the newest verified archive, even when it would otherwise fall outside the
     * count. This makes a temporary verification failure unable to erase the
     * last known-good recovery point.
     */
    static List<RestorePoint> pruneByCount(List<RestorePoint> newestFirst, int retention) {
        RestorePoint newestVerified = newestVerified(newestFirst);
        int keep = Math.max(retention, 1);
        return newestFirst.stream()
                .skip(keep)
                .filter(point -> newestVerified == null || point.id() != newestVerified.id())
                .toList();
    }

    /**
     * Global automatic backups use the appliance setting expressed in days.
     * An old newest-verified point is still retained as the minimum recovery
     * floor when newer archives have not successfully verified.
     */
    static List<RestorePoint> pruneBefore(List<RestorePoint> newestFirst, Instant cutoff) {
        RestorePoint newestVerified = newestVerified(newestFirst);
        return newestFirst.stream()
                .filter(point -> point.createdAt().isBefore(cutoff))
                .filter(point -> newestVerified == null || point.id() != newestVerified.id())
                .toList();
    }

    private static RestorePoint newestVerified(List<RestorePoint> newestFirst) {
        return newestFirst.stream()
                .filter(point -> AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus()))
                .findFirst()
                .orElse(null);
    }
}
