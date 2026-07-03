package com.autarkos.backups;

public record BackupSettingsSummary(
        boolean automaticBackupsEnabled,
        String frequency,
        int retentionDays,
        String backupTime,
        String nextRunLabel,
        String schedulerHealth,
        String schedulerMessage,
        RestorePoint lastRoutineRun,
        RestorePoint lastSuccessfulRoutineRun,
        RestorePoint lastSuccessfulVerification,
        String nextRoutineRun) {
}
