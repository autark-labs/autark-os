import { backupSafetyWarnings } from '../../lib/backupSafety';
import type { AppBackupStatus, RestorePoint } from '@/types/backup';

/**
 * @param {import('@/types/backup').RestorePoint} point
 * @param {Array<{ appId: string; appName: string }>} apps
 */
export function restorePointDetails(point: RestorePoint, apps: AppBackupStatus[] = []) {
  const includedIds = point.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean);
  const includedApps = point.scope === 'full'
    ? includedIds.map(id => apps.find(app => app.appId === id)?.appName ?? `${id} (not currently managed)`)
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
    warnings: defaultWarnings(point),
  };
}

function defaultWarnings(point: RestorePoint) {
  return backupSafetyWarnings('restore', { verified: point.verificationStatus === 'verified' });
}
