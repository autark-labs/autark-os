import type { AutarkOsJob, AutarkOsJobStep } from '@/types/jobs';

const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export const ACTIVE_JOB_LIST_REFETCH_INTERVAL_MS = 1_200;
export const IDLE_JOB_LIST_REFETCH_INTERVAL_MS = 15_000;

export const JOB_FAMILIES = {
  appLifecycle: ['install_app', 'repair_app', 'update_app', 'rollback_app', 'uninstall_app', 'start_app', 'stop_app', 'restart_app'],
  backup: ['backup', 'backup_verify', 'backup_restore', 'restore'],
  discover: ['install_app', 'backup'],
  install: ['install_app'],
};

export function terminalJob(job?: Pick<AutarkOsJob, 'status'> | null) {
  return TERMINAL_JOB_STATUSES.has(job?.status ?? '');
}

export function activeJobs(jobs: AutarkOsJob[] | null | undefined, types: string[] = []) {
  const allowedTypes = new Set(types);
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => job && !terminalJob(job))
    .filter((job) => allowedTypes.size === 0 || allowedTypes.has(job.type))
    .sort((left, right) => jobTime(right) - jobTime(left));
}

export function latestActiveJob(jobs: AutarkOsJob[] | null | undefined, types: string[] = []) {
  return activeJobs(jobs, types)[0] ?? null;
}

export function jobListRefetchInterval(jobs: AutarkOsJob[] | null | undefined) {
  return activeJobs(jobs).length > 0
    ? ACTIVE_JOB_LIST_REFETCH_INTERVAL_MS
    : IDLE_JOB_LIST_REFETCH_INTERVAL_MS;
}

export function activeJobsByFamily(jobs: AutarkOsJob[] | null | undefined) {
  return {
    appLifecycle: activeJobs(jobs, JOB_FAMILIES.appLifecycle),
    backup: activeJobs(jobs, JOB_FAMILIES.backup),
    discover: activeJobs(jobs, JOB_FAMILIES.discover),
    install: activeJobs(jobs, JOB_FAMILIES.install),
  };
}

export function currentJobStep(job?: AutarkOsJob | null) {
  const step = job?.steps?.find((candidate) => candidate.id === job.currentStep)
    ?? job?.steps?.find((candidate) => candidate.status === 'running')
    ?? job?.steps?.find((candidate) => candidate.status === 'pending');
  if (!step) {
    return null;
  }
  return step;
}

export function currentJobStepText(job?: AutarkOsJob | null, fallback = '') {
  const step = currentJobStep(job);
  return step?.message || step?.label || fallback;
}

export function queuedJobText(
  job?: { subjectId?: string | null; type?: string | null } | null,
  subjectLabel?: string,
) {
  const subject = subjectLabel || job?.subjectId || '';
  if (job?.type === 'install_app') {
    return `${subject ? `${subject} is` : 'This app is'} waiting to install. Autark-OS installs one app at a time to keep its network setup safe.`;
  }
  return `${jobTypeLabel(job?.type)}${subject ? ` for ${subject}` : ''} is waiting to start.`;
}

export function jobProgressPercent(job?: AutarkOsJob | null) {
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  if (!steps.length) {
    return terminalJob(job) ? 100 : 8;
  }
  if (job?.status === 'succeeded') {
    return 100;
  }
  if (job?.status === 'failed' || job?.status === 'cancelled') {
    return Math.max(8, Math.round((completedSteps(steps) / steps.length) * 100));
  }
  const runningStepIndex = steps.findIndex((step) => step.status === 'running' || step.id === job?.currentStep);
  const progressStepCount = runningStepIndex >= 0 ? Math.max(completedSteps(steps), runningStepIndex) + 0.5 : completedSteps(steps);
  return Math.min(100, Math.max(8, Math.round((progressStepCount / steps.length) * 100)));
}

export function jobTypeLabel(type?: string | null) {
  switch (type) {
    case 'install_app':
      return 'Install';
    case 'repair_app':
      return 'Repair';
    case 'backup':
      return 'Backup';
    case 'backup_verify':
      return 'Backup verification';
    case 'backup_restore':
    case 'restore':
      return 'Restore';
    case 'update_app':
      return 'Update';
    case 'rollback_app':
      return 'Rollback';
    case 'start_app':
      return 'Start';
    case 'stop_app':
      return 'Pause';
    case 'restart_app':
      return 'Restart';
    case 'uninstall_app':
      return 'Uninstall';
    default:
      return 'Autark-OS task';
  }
}

function completedSteps(steps: AutarkOsJobStep[]) {
  return steps.filter((step) => ['succeeded', 'skipped'].includes(step.status)).length;
}

function jobTime(job: Pick<AutarkOsJob, 'createdAt' | 'updatedAt'>) {
  const value = job?.updatedAt || job?.createdAt || '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
