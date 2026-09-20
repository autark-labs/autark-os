import { activeJobs } from '../../repositories/jobRepository.logic';
import { formatLocalizedDateTime } from '@/lib/dateTime';
import type { BackupReport, RestorePoint } from '@/types/backup';
import type { AutarkOsJob } from '@/types/jobs';

export function reportRestorePoints(report: BackupReport): RestorePoint[] {
  return [...new Map([...report.recentRestorePoints, ...report.apps.flatMap(app => app.restorePoints ?? [])]
    .map(point => [point.id, point])).values()];
}

export function restorePointIncludesApp(point: RestorePoint, appId: string): boolean {
  return point.scope === 'full'
    ? (point.includedAppIds ?? '').split(',').map(id => id.trim()).includes(appId)
    : point.appId === appId;
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function formatBackupDate(value: string | null | undefined, timeZone?: string | null) {
  return formatLocalizedDateTime(value, timeZone, 'None');
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatBackupBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * @param {string} status
 * @returns {string}
 */
export function backupStatusLabel(status: string) {
  if (status === 'manual_only') return 'Manual run required';
  if (status === 'needs_backup_review') return 'Needs backup review';
  if (status === 'recovery_limited') return 'Recovery limited';
  if (status === 'not_backed_up') return 'No restore point yet';
  if (status === 'unprotected') return 'Backups off';
  if (status === 'protected') return 'Protected by restore point';
  return status.replaceAll('_', ' ');
}

const BACKUP_JOB_TYPES = ['backup', 'backup_verify', 'backup_restore'];

export type BackupOperation = 'app_backup' | 'cleanup' | 'full_backup' | 'restore' | 'routine_backup' | 'verify';
export type BackupOperationAvailability = { disabled: boolean; reason: string };

const backupOperationLabels: Record<BackupOperation, string> = {
  app_backup: 'app backup',
  cleanup: 'backup cleanup',
  full_backup: 'full checkpoint',
  restore: 'restore',
  routine_backup: 'routine backup',
  verify: 'restore-point verification',
};

// Backup data and restore points are shared resources. No concurrent pair is safe today.
export const backupOperationConflicts: Record<BackupOperation, readonly BackupOperation[]> = {
  app_backup: ['app_backup', 'cleanup', 'full_backup', 'restore', 'routine_backup', 'verify'],
  cleanup: ['app_backup', 'cleanup', 'full_backup', 'restore', 'routine_backup', 'verify'],
  full_backup: ['app_backup', 'cleanup', 'full_backup', 'restore', 'routine_backup', 'verify'],
  restore: ['app_backup', 'cleanup', 'full_backup', 'restore', 'routine_backup', 'verify'],
  routine_backup: ['app_backup', 'cleanup', 'full_backup', 'restore', 'routine_backup', 'verify'],
  verify: ['app_backup', 'cleanup', 'full_backup', 'restore', 'routine_backup', 'verify'],
};

export function backupOperationForJob(job?: Pick<AutarkOsJob, 'subjectId' | 'type'> | null): BackupOperation | null {
  if (job?.type === 'backup_restore') return 'restore';
  if (job?.type === 'backup_verify') return 'verify';
  if (job?.type !== 'backup') return null;
  if (job.subjectId === '__routine__') return 'routine_backup';
  if (job.subjectId === '__full__') return 'full_backup';
  return 'app_backup';
}

export function backupOperationForRunningId(runningId: string | null): BackupOperation | null {
  if (!runningId) return null;
  if (runningId.startsWith('restore-')) return 'restore';
  if (runningId.startsWith('verify-')) return 'verify';
  if (runningId === 'routine') return 'routine_backup';
  if (runningId === 'full') return 'full_backup';
  if (runningId.startsWith('app-')) return 'app_backup';
  return null;
}

export function backupOperationAvailability(requested: BackupOperation, active: readonly BackupOperation[]): BackupOperationAvailability {
  const blocking = active.find((operation) => backupOperationConflicts[requested].includes(operation));
  return blocking
    ? { disabled: true, reason: `Wait for the ${backupOperationLabels[blocking]} to finish before starting this ${backupOperationLabels[requested]}.` }
    : { disabled: false, reason: '' };
}

/**
 * @param {Array<{ type?: string, status?: string, updatedAt?: string, createdAt?: string }>} jobs
 * @returns {Array<unknown>}
 */
export function activeBackupJobs(jobs: AutarkOsJob[] | null | undefined) {
  return activeJobs(jobs, BACKUP_JOB_TYPES);
}

/**
 * @param {Array<{ type?: string, status?: string, updatedAt?: string, createdAt?: string }>} jobs
 * @returns {unknown | null}
 */
export function selectActiveBackupJob(jobs: AutarkOsJob[] | null | undefined) {
  return activeBackupJobs(jobs)[0] ?? null;
}

/**
 * @param {{ type?: string, subjectId?: string | null } | null | undefined} job
 * @returns {string}
 */
export function backupJobRunningId(job?: Pick<AutarkOsJob, 'subjectId' | 'type'> | null) {
  const subjectId = job?.subjectId || '';
  if (job?.type === 'backup_restore') {
    return `restore-${subjectId.split(':')[0] || subjectId}`;
  }
  if (job?.type === 'backup_verify') {
    return `verify-${subjectId}`;
  }
  if (subjectId === '__full__') {
    return 'full';
  }
  if (subjectId === '__routine__') {
    return 'routine';
  }
  return subjectId ? `app-${subjectId}` : 'backup';
}
