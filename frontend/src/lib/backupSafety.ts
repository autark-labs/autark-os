const warnings = {
  reinstall: 'Reinstalling should keep the configured data folders, but create a backup first so you have a restore point.',
  reset: 'Reset and reinstall can remove app state. Back up the app first and only use this when you are comfortable rebuilding it.',
  restoreReplacement: 'Current app data will be replaced by the selected restore point.',
  restoreSafetyBackup: 'Autark-OS creates a safety backup of current app data before restoring.',
  restoreVerification: 'Verify this restore point before restoring if the current app data matters.',
  storageCleanupCheckpoint: 'After you confirm, Autark-OS archives the declared app data, then deletes this unused folder and its contents.',
  storageCleanupScope: 'The ZIP is kept in the backup destination’s storage-cleanup folder for manual recovery. It is not a Backups restore point and does not preserve the complete app installation. Installed app folders are left unchanged.',
};

type BackupSafetyAction = 'reinstall' | 'reset' | 'restore' | 'storage-cleanup' | string;

export function backupSafetyWarning(action: BackupSafetyAction) {
  if (action === 'reset') {
    return warnings.reset;
  }
  if (action === 'restore') {
    return warnings.restoreReplacement;
  }
  if (action === 'storage-cleanup') {
    return warnings.storageCleanupCheckpoint;
  }
  return warnings.reinstall;
}

export function backupSafetyWarnings(action: BackupSafetyAction, options: { verified?: boolean } = {}) {
  if (action === 'restore') {
    const restoreWarnings = [warnings.restoreReplacement, warnings.restoreSafetyBackup];
    if (options.verified === false) {
      restoreWarnings.push(warnings.restoreVerification);
    }
    return restoreWarnings;
  }
  return [backupSafetyWarning(action)];
}

export function backupSafetyChecklist(action: BackupSafetyAction) {
  if (action === 'storage-cleanup') {
    return [warnings.storageCleanupCheckpoint, warnings.storageCleanupScope];
  }
  return backupSafetyWarnings(action);
}
