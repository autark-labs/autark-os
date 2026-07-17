import { backupSafetyWarnings } from '../../lib/backupSafety';
import type { AppBackupStatus, RestorePlan, RestorePoint } from '@/types/backup';

/**
 * @param {import('@/types/backup').RestorePoint} point
 * @param {Array<{ appId: string; appName: string }>} apps
 * @param {import('@/types/backup').RestorePlan | null} plan
 */
export function restorePointDetails(point: RestorePoint, apps: AppBackupStatus[] = [], plan: RestorePlan | null = null) {
  const includedIds = point.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean);
  const includedApps = point.scope === 'full'
    ? apps.filter((app) => includedIds.includes(app.appId)).map((app) => app.appName)
    : [point.appName].filter(Boolean);
  const verification = point.verificationStatus === 'verified'
    ? `Verified with ${point.restoreConfidence || 'unknown'} confidence.`
    : point.verificationStatus === 'failed'
      ? 'Verification failed. Do not restore until this has been reviewed.'
      : point.verificationStatus === 'legacy_unverified'
        ? 'Legacy restore point. It has no immutable integrity baseline, so create a new backup before restoring.'
        : 'Not verified yet. Normal restore is blocked until verification succeeds.';

  return {
    title: point.scope === 'full' ? 'Full restore point details' : `${point.appName} restore point details`,
    includedApps,
    verification,
    checksum: point.integrityBaselineSha256 || point.checksumSha256 || 'No immutable checksum recorded',
    location: point.path,
    restoreSummary: plan?.summary || 'Open restore to preview the exact restore steps.',
    warnings: plan?.warnings?.length ? plan.warnings : defaultWarnings(point),
  };
}

function defaultWarnings(point: RestorePoint) {
  return backupSafetyWarnings('restore', { verified: point.verificationStatus === 'verified' });
}
