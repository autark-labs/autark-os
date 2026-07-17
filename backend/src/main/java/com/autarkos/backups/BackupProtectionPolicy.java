package com.autarkos.backups;

import com.autarkos.api.AutarkOsStates;

/** One product rule for every surface that describes an app as protected. */
public final class BackupProtectionPolicy {

    private BackupProtectionPolicy() {
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
