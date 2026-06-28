const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export const JOB_FAMILIES = {
  appLifecycle: ['install_app', 'repair_app', 'update_app'],
  backup: ['backup', 'backup_verify', 'backup_restore', 'restore'],
  discover: ['install_app', 'backup'],
  install: ['install_app'],
};

export function terminalJob(job) {
  return TERMINAL_JOB_STATUSES.has(job?.status);
}

export function activeJobs(jobs, types = []) {
  const allowedTypes = new Set(types);
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => job && !terminalJob(job))
    .filter((job) => allowedTypes.size === 0 || allowedTypes.has(job.type))
    .toSorted((left, right) => jobTime(right) - jobTime(left));
}

export function latestActiveJob(jobs, types = []) {
  return activeJobs(jobs, types)[0] ?? null;
}

export function activeJobsByFamily(jobs) {
  return {
    appLifecycle: activeJobs(jobs, JOB_FAMILIES.appLifecycle),
    backup: activeJobs(jobs, JOB_FAMILIES.backup),
    discover: activeJobs(jobs, JOB_FAMILIES.discover),
    install: activeJobs(jobs, JOB_FAMILIES.install),
  };
}

export function currentJobStep(job) {
  const step = job?.steps?.find((candidate) => candidate.id === job.currentStep)
    ?? job?.steps?.find((candidate) => candidate.status === 'running')
    ?? job?.steps?.find((candidate) => candidate.status === 'pending');
  if (!step) {
    return null;
  }
  return step;
}

export function currentJobStepText(job, fallback = '') {
  const step = currentJobStep(job);
  return step?.message || step?.label || fallback;
}

export function jobProgressPercent(job) {
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  if (!steps.length) {
    return terminalJob(job) ? 100 : 8;
  }
  if (job.status === 'succeeded') {
    return 100;
  }
  if (job.status === 'failed' || job.status === 'cancelled') {
    return Math.max(8, Math.round((completedSteps(steps) / steps.length) * 100));
  }
  const runningStepIndex = steps.findIndex((step) => step.status === 'running' || step.id === job.currentStep);
  const progressStepCount = runningStepIndex >= 0 ? Math.max(completedSteps(steps), runningStepIndex) + 0.5 : completedSteps(steps);
  return Math.min(100, Math.max(8, Math.round((progressStepCount / steps.length) * 100)));
}

export function jobTypeLabel(type) {
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
    default:
      return 'Project OS task';
  }
}

function completedSteps(steps) {
  return steps.filter((step) => ['succeeded', 'skipped'].includes(step.status)).length;
}

function jobTime(job) {
  const value = job?.updatedAt || job?.createdAt || '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
