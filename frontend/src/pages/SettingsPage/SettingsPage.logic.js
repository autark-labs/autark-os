/**
 * @param {Record<string, unknown> | null | undefined} previous
 * @param {Record<string, unknown> | null | undefined} saved
 * @returns {boolean}
 */
export function shouldApplyProjectSettingsToApps(previous, saved) {
  if (!saved) return false;
  if (!previous) return true;
  return previous.automaticRepairEnabled !== saved.automaticRepairEnabled
    || previous.automaticBackupsEnabled !== saved.automaticBackupsEnabled
    || previous.backupFrequency !== saved.backupFrequency
    || previous.backupRetentionDays !== saved.backupRetentionDays;
}
