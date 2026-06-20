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
  if (status === 'not_backed_up') return 'No backup yet';
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
  if (status === 'warning') return 'border-red-300/20 bg-red-500/10 text-red-100';
  if (status === 'off') return 'border-slate-700 bg-slate-900 text-slate-300';
  return 'border-amber-300/20 bg-amber-500/10 text-amber-100';
}

/**
 * @param {string} status
 * @returns {string}
 */
export function backupAppBadgeTone(status) {
  if (status === 'protected') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  if (status === 'failed') return 'border-red-300/20 bg-red-500/10 text-red-100';
  return 'border-amber-300/20 bg-amber-500/10 text-amber-100';
}

/**
 * @param {unknown} report
 * @param {unknown} latestRestore
 * @returns {{ summary: string; title: string }}
 */
export function backupProtectionHero(report, latestRestore) {
  if (!report) {
    return {
      summary: 'Project OS could not read backup status yet. Refresh the page or check Support if this continues.',
      title: 'Protection status is unknown',
    };
  }
  if (report.status === 'protected') {
    return {
      summary: latestRestore
        ? `Your apps have backup protection. The latest restore point was created ${formatBackupDate(latestRestore.createdAt)}, and the next scheduled backup is ${report.settings.nextRoutineRun ? formatBackupDate(report.settings.nextRoutineRun) : 'not scheduled'}.`
        : 'Your apps are configured for protection. Run a routine backup to create the first restore point.',
      title: 'Your data is protected',
    };
  }
  if (report.failedBackups > 0) {
    return {
      summary: `${report.failedBackups} backup ${report.failedBackups === 1 ? 'run needs' : 'runs need'} attention. Review the affected apps and create a fresh checkpoint after fixing the issue.`,
      title: 'Backup protection needs attention',
    };
  }
  return {
    summary: report.summary || 'Some apps still need a successful backup before Project OS can call them protected.',
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
