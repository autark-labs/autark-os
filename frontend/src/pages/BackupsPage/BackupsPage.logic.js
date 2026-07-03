import { activeJobs } from '../../repositories/jobRepository.logic.js';

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function formatBackupDate(value) {
  if (!value) return 'None';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatBackupBytes(value) {
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
export function capitalizeBackupLabel(value) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : value;
}

/**
 * @param {string} status
 * @returns {string}
 */
export function backupStatusLabel(status) {
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
export function backupSchedulerLabel(status) {
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
export function backupSchedulerTone(status) {
  if (status === 'healthy') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  if (status === 'warning') return 'border-red-400/40 bg-red-500/10 text-red-200';
  if (status === 'off') return 'border-slate-700 bg-slate-900 text-slate-300';
  return 'border-orange-400/45 bg-orange-500/10 text-orange-200';
}

/**
 * @param {string} status
 * @returns {string}
 */
export function backupAppBadgeTone(status) {
  if (status === 'protected') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  if (status === 'failed') return 'border-red-400/40 bg-red-500/10 text-red-200';
  return 'border-orange-400/45 bg-orange-500/10 text-orange-200';
}

/**
 * @param {{ type?: string } | null | undefined} job
 * @returns {string}
 */
export function backupJobBannerTitle(job) {
  if (job?.type === 'backup_verify') return 'Verification in progress';
  if (job?.type === 'backup_restore') return 'Restore in progress';
  return 'Backup in progress';
}

/**
 * @param {{ type?: string } | null | undefined} job
 * @returns {string}
 */
export function backupJobStartedMessage(job) {
  if (job?.type === 'backup_verify') return 'Verification job started. Autark-OS will update the restore point when it finishes.';
  if (job?.type === 'backup_restore') return 'Restore job started. Autark-OS will update app and backup state when it finishes.';
  return 'Backup job started. Autark-OS will update restore points when it finishes.';
}

/**
 * @param {{ type?: string } | null | undefined} job
 * @returns {string}
 */
export function backupJobCompletedMessage(job) {
  if (job?.type === 'backup_verify') return 'Verification job completed.';
  if (job?.type === 'backup_restore') return 'Restore job completed.';
  return 'Backup job completed.';
}

const BACKUP_JOB_TYPES = ['backup', 'backup_verify', 'backup_restore'];

/**
 * @param {Array<{ type?: string, status?: string, updatedAt?: string, createdAt?: string }>} jobs
 * @returns {Array<unknown>}
 */
export function activeBackupJobs(jobs) {
  return activeJobs(jobs, BACKUP_JOB_TYPES);
}

/**
 * @param {Array<{ type?: string, status?: string, updatedAt?: string, createdAt?: string }>} jobs
 * @returns {unknown | null}
 */
export function selectActiveBackupJob(jobs) {
  return activeBackupJobs(jobs)[0] ?? null;
}

/**
 * @param {{ type?: string, subjectId?: string | null } | null | undefined} job
 * @returns {string}
 */
export function backupJobRunningId(job) {
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
export function backupProtectionHero(report, latestRestore) {
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
      summary: `Your apps are protected by a restore point. The latest restore point was created ${formatBackupDate(latestRestore.createdAt)}, and the next scheduled backup is ${report.settings.nextRoutineRun ? formatBackupDate(report.settings.nextRoutineRun) : 'not scheduled'}.`,
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
export function backupPageViewModel(report) {
  const restorePoints = report?.recentRestorePoints ?? [];
  const latestRestore = restorePoints.find((point) => point.status === 'completed') ?? null;
  return {
    appRestorePoints: restorePoints.filter((point) => point.scope !== 'full' && point.status === 'completed'),
    fullRestorePoints: restorePoints.filter((point) => point.scope === 'full' && point.status === 'completed'),
    latestRestore,
    needsAttention: report?.apps.filter((app) => app.status !== 'protected') ?? [],
    protectionHero: backupProtectionHero(report, latestRestore),
    routineRestorePoints: restorePoints.filter((point) => point.scope === 'full' && point.source === 'automatic' && point.status === 'completed'),
  };
}
