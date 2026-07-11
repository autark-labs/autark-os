import { activeJobs } from '../../repositories/jobRepository.logic';
import type { SemanticStatusTone } from '@/components/primitives/SemanticVariants';
import { formatLocalizedDateTime } from '@/lib/dateTime';
import type { AppBackupStatus, BackupReport, RestorePoint } from '@/types/backup';
import type { AutarkOsJob } from '@/types/jobs';

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
 * @param {string} value
 * @returns {string}
 */
export function capitalizeBackupLabel(value: string) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : value;
}

/**
 * @param {string} status
 * @returns {string}
 */
export function backupStatusLabel(status: string) {
  if (status === 'manual_only') return 'Manual run required';
  if (status === 'needs_backup_review') return 'Needs backup review';
  if (status === 'not_backed_up') return 'No restore point yet';
  if (status === 'unprotected') return 'Backups off';
  if (status === 'protected') return 'Protected by restore point';
  return status.replaceAll('_', ' ');
}

/**
 * @param {string} status
 * @returns {string}
 */
export function backupSchedulerLabel(status: string) {
  if (status === 'off') return 'Off';
  if (status === 'manual_only') return 'Run-now mode';
  if (status === 'warning') return 'Needs attention';
  if (status === 'healthy') return 'Healthy';
  return backupStatusLabel(status);
}

/**
 * @param {string} status
 * @returns {string}
 */
export function backupSchedulerTone(status: string): SemanticStatusTone {
  if (status === 'healthy') return 'success';
  if (status === 'warning') return 'danger';
  if (status === 'off') return 'muted';
  return 'warning';
}

/**
 * @param {string} status
 * @returns {string}
 */
export function backupAppBadgeTone(status: string): SemanticStatusTone {
  if (status === 'protected') return 'success';
  if (status === 'failed') return 'danger';
  return 'warning';
}

/**
 * @param {{ type?: string } | null | undefined} job
 * @returns {string}
 */
export function backupJobBannerTitle(job?: Pick<AutarkOsJob, 'type'> | null) {
  if (job?.type === 'backup_verify') return 'Verification in progress';
  if (job?.type === 'backup_restore') return 'Restore in progress';
  return 'Backup in progress';
}

/**
 * @param {{ type?: string } | null | undefined} job
 * @returns {string}
 */
export function backupJobStartedMessage(job?: Pick<AutarkOsJob, 'type'> | null) {
  if (job?.type === 'backup_verify') return 'Verification job started. Autark-OS will update the restore point when it finishes.';
  if (job?.type === 'backup_restore') return 'Restore job started. Autark-OS will update app and backup state when it finishes.';
  return 'Backup job started. Autark-OS will update restore points when it finishes.';
}

/**
 * @param {{ type?: string } | null | undefined} job
 * @returns {string}
 */
export function backupJobCompletedMessage(job?: Pick<AutarkOsJob, 'type'> | null) {
  if (job?.type === 'backup_verify') return 'Verification job completed.';
  if (job?.type === 'backup_restore') return 'Restore job completed.';
  return 'Backup job completed.';
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

/**
 * @param {unknown} report
 * @param {unknown} latestRestore
 * @returns {{ summary: string; title: string }}
 */
export function backupProtectionHero(report: BackupReport | null | undefined, latestRestore: RestorePoint | null | undefined) {
  if (!report) {
    return {
      summary: 'Autark-OS could not read backup status yet. Refresh the page or check Support if this continues.',
      title: 'Protection status is unknown',
    };
  }
  if (report.status === 'protected') {
    if (!latestRestore) {
      return {
        summary: 'Backups are configured, but Autark-OS has not created a completed restore point yet.',
        title: 'Create the first restore point',
      };
    }
    return {
      summary: `Your apps are protected by a restore point. The latest restore point was created ${formatBackupDate(latestRestore.createdAt)}, and the next scheduled backup is ${report.settings.nextRoutineRun ? formatBackupDate(report.settings.nextRoutineRun, report.settings.timeZone) : 'not scheduled'}.`,
      title: 'Protected by restore point',
    };
  }
  if (report.failedBackups > 0) {
    return {
      summary: `${report.failedBackups} backup ${report.failedBackups === 1 ? 'run needs' : 'runs need'} attention. Review the affected apps and create a fresh checkpoint after fixing the issue.`,
      title: 'Backup protection needs attention',
    };
  }
  return {
    summary: report.summary || 'Some apps still need a successful backup before Autark-OS can call them protected.',
    title: 'Finish backup protection',
  };
}

/**
 * @param {unknown | null} report
 */
export function backupPageViewModel(report: BackupReport | null | undefined) {
  const restorePoints: RestorePoint[] = report?.recentRestorePoints ?? [];
  const latestRestore = restorePoints.find((point) => point.status === 'completed') ?? null;
  return {
    appRestorePoints: restorePoints.filter((point) => point.scope !== 'full' && point.status === 'completed'),
    fullRestorePoints: restorePoints.filter((point) => point.scope === 'full' && point.status === 'completed'),
    latestRestore,
    needsAttention: report?.apps.filter((app: AppBackupStatus) => app.status !== 'protected') ?? [],
    protectionHero: backupProtectionHero(report, latestRestore),
    routineRestorePoints: restorePoints.filter((point) => point.scope === 'full' && point.source === 'automatic' && point.status === 'completed'),
  };
}
