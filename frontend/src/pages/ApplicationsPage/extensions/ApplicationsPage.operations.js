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

  const terminalJob = matchingJobs.find((job) => TERMINAL_JOB_STATUSES.has(job.status));
  if (terminalJob?.status === 'failed' && failedJobStillRelevant(item, terminalJob)) {
    return {
      kind: 'failed',
      label: 'Action failed',
      message: terminalJob.error?.message || 'Autark-OS could not finish this action.',
      jobId: terminalJob.jobId,
    };
  }

  return { kind: 'idle' };
}

export function runtimeControlsDisabled(operationState, loadingAction) {
  if (loadingAction) {
    return true;
  }
  const kind = operationState?.kind ?? 'idle';
  return kind !== 'idle' && kind !== 'failed';
}

export function operationBlocksManagement(operationState) {
  const kind = operationState?.kind ?? 'idle';
  return kind !== 'idle' && kind !== 'failed';
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
  if (action === 'repair') {
    return {
      kind: 'repairing',
      label: 'Repairing',
    };
  }
  if (action === 'backup') {
    return {
      kind: 'backing_up',
      label: 'Creating backup',
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
  if (job.type === 'repair_app') {
    return {
      kind: 'repairing',
      label: 'Repairing',
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
  if (job.type === 'backup_restore') {
    return {
      kind: 'restoring',
      label: 'Restoring',
      jobId: job.jobId,
      currentStep: currentJobStepText(job),
    };
  }
  return { kind: 'idle' };
}

function jobsForItem(item, jobs) {
  const itemIds = new Set([item?.id, item?.sourceId].filter(Boolean));
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => jobTargetsItem(job, itemIds))
    .filter((job) => ['start_app', 'stop_app', 'restart_app', 'repair_app', 'backup', 'backup_verify', 'backup_restore', 'uninstall_app'].includes(job.type))
    .toSorted((left, right) => jobTime(right) - jobTime(left));
}

function jobTargetsItem(job, itemIds) {
  if (itemIds.has(job.subjectId)) {
    return true;
  }
  if (job.type !== 'backup_restore') {
    return false;
  }
  const target = restoreTarget(job.subjectId);
  return target === 'all' || itemIds.has(target);
}

function restoreTarget(subjectId) {
  if (!subjectId) {
    return '';
  }
  const separator = subjectId.indexOf(':');
  return separator < 0 ? subjectId : subjectId.slice(separator + 1);
}

function failedJobStillRelevant(item, job) {
  if (isFailedFullRestore(job)) {
    return false;
  }
  if (!['start_app', 'stop_app', 'restart_app', 'repair_app'].includes(job.type)) {
    return true;
  }
  if (!item?.readinessState && !item?.attentionState) {
    return true;
  }
  if (['ready', 'starting', 'paused'].includes(item?.readinessState)) {
    return false;
  }
  return item?.attentionState !== 'none' || ['stopped', 'unreachable', 'unknown'].includes(item?.readinessState);
}

function isFailedFullRestore(job) {
  return job?.type === 'backup_restore' && job.status === 'failed' && restoreTarget(job.subjectId) === 'all';
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
