package com.autarkos.backups;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.model.ApplicationManifest;
import java.util.Arrays;
import java.util.List;

/** One product rule for every surface that describes an app as protected. */
public final class BackupProtectionPolicy {

    private BackupProtectionPolicy() {
    }

    public static boolean includesApp(RestorePoint point, String appId) {
        return "app".equals(point.scope()) ? appId.equals(point.appId())
                : "full".equals(point.scope()) && point.includedAppIds() != null
                && Arrays.stream(point.includedAppIds().split(",")).map(String::trim).anyMatch(appId::equals);
    }

    public static boolean isCompatible(RestorePoint point, ApplicationManifest manifest) {
        return manifest != null && includesApp(point, manifest.id())
                && "cold_file".equals(point.backupContractStrategy())
                && "cold_file".equals(manifest.runtime().backupStrategy())
                && !manifest.runtime().backupPaths().isEmpty()
                && manifest.runtime().backupContractVersion() == point.backupContractVersion()
                // Full archives currently record only the v1 stopped-file contract.
                && (!"full".equals(point.scope()) || point.backupContractVersion() == 1);
    }

    public static String state(boolean enabled, ApplicationManifest manifest, List<RestorePoint> points) {
        if (!enabled) return AutarkOsStates.BackupState.DISABLED;
        return points.stream().anyMatch(point -> isProtected(point) && isCompatible(point, manifest))
                ? AutarkOsStates.BackupState.PROTECTED_BY_RESTORE_POINT
                : AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT;
    }

    public static boolean isProtected(RestorePoint restorePoint) {
        return restorePoint != null
                && AutarkOsStates.RestorePointStatus.COMPLETED.equalsIgnoreCase(restorePoint.status())
                && AutarkOsStates.RestorePointStatus.VERIFIED.equalsIgnoreCase(restorePoint.verificationStatus())
                && restorePoint.integrityBaselineSha256() != null
                && restorePoint.integrityBaselineSha256().matches("[a-fA-F0-9]{64}")
                && restorePoint.backupContractVersion() >= 1
                && "cold_file".equals(restorePoint.backupContractStrategy());
    }
}
