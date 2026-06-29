const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'canceled']);

export function operationStateForItem(item, localAction, settingsAction, jobs = []) {
  const matchingJobs = jobsForItem(item, jobs);
  const activeJob = matchingJobs.find((job) => !TERMINAL_JOB_STATUSES.has(job.status));
  if (activeJob) {
    return operationStateFromJob(activeJob);
  }

  if (item?.operationState && item.operationState.kind && item.operationState.kind !== 'idle') {
    return item.operationState;
  }

  if (localAction) {
    return operationStateFromLocalAction(localAction);
  }

  if (settingsAction === 'saving') {
    return {
      kind: 'saving_settings',
      label: 'Saving settings',
    };
  }

  const failedJob = matchingJobs.find((job) => job.status === 'failed');
  if (failedJob) {
    return {
      kind: 'failed',
      label: 'Action failed',
      message: failedJob.error?.message || 'Project OS could not finish this action.',
      jobId: failedJob.jobId,
    };
  }

  return { kind: 'idle' };
}

function operationStateFromLocalAction(action) {
  if (action === 'start') {
    return {
      kind: 'starting',
      label: 'Starting',
    };
  }
  if (action === 'stop') {
    return {
      kind: 'stopping',
      label: 'Pausing',
    };
  }
  if (action === 'restart') {
    return {
      kind: 'restarting',
      label: 'Restarting',
    };
  }
  return { kind: 'idle' };
}

function operationStateFromJob(job) {
  if (job.type === 'start_app') {
    return {
      kind: 'starting',
      label: 'Starting',
      jobId: job.jobId,
      currentStep: currentJobStepText(job),
    };
  }
  if (job.type === 'stop_app') {
    return {
      kind: 'stopping',
      label: 'Pausing',
      jobId: job.jobId,
      currentStep: currentJobStepText(job),
    };
  }
  if (job.type === 'restart_app') {
    return {
      kind: 'restarting',
      label: 'Restarting',
      jobId: job.jobId,
      currentStep: currentJobStepText(job),
    };
  }
  if (job.type === 'uninstall_app') {
    return {
      kind: 'uninstalling',
      label: 'Uninstalling safely',
      jobId: job.jobId,
      currentStep: currentJobStepText(job),
    };
  }
  if (job.type === 'backup' || job.type === 'backup_verify') {
    return {
      kind: 'backing_up',
      label: 'Creating backup',
      jobId: job.jobId,
      currentStep: currentJobStepText(job),
    };
  }
  return { kind: 'idle' };
}

function jobsForItem(item, jobs) {
  const itemIds = new Set([item?.id, item?.sourceId].filter(Boolean));
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => itemIds.has(job.subjectId))
    .filter((job) => ['start_app', 'stop_app', 'restart_app', 'backup', 'backup_verify', 'uninstall_app'].includes(job.type))
    .toSorted((left, right) => jobTime(right) - jobTime(left));
}

function currentJobStepText(job) {
  const step = job?.steps?.find((candidate) => candidate.id === job.currentStep)
    ?? job?.steps?.find((candidate) => candidate.status === 'running')
    ?? job?.steps?.find((candidate) => candidate.status === 'pending');
  return step?.message || step?.label || '';
}

function jobTime(job) {
  const parsed = Date.parse(job?.updatedAt || job?.createdAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}
