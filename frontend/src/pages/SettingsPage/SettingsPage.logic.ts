/**
 * @param {Record<string, unknown> | null | undefined} previous
 * @param {Record<string, unknown> | null | undefined} saved
 * @returns {boolean}
 */
import type { ProjectSettings } from '@/types/system';

export function shouldApplyProjectSettingsToApps(
  previous: Partial<ProjectSettings> | null | undefined,
  saved: Partial<ProjectSettings> | null | undefined,
) {
  if (!saved) return false;
  if (!previous) return true;
  return previous.automaticRepairEnabled !== saved.automaticRepairEnabled
    || previous.automaticBackupsEnabled !== saved.automaticBackupsEnabled
    || previous.backupFrequency !== saved.backupFrequency
    || previous.backupRetentionDays !== saved.backupRetentionDays;
}
