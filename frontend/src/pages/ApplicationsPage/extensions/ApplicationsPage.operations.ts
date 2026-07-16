import type { AutarkOsJob } from '@/types/jobs';
import type {
  ApplicationRuntimeAction,
  ApplicationSettingsAction,
  ApplicationSurfaceItem,
  AppOperationState,
} from './ApplicationsPage.types';

const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'canceled']);

export function operationStateForItem(
  item: Pick<ApplicationSurfaceItem, 'attentionState' | 'id' | 'operationState' | 'readinessState' | 'sourceId'>,
  localAction: ApplicationRuntimeAction | null,
  settingsAction: ApplicationSettingsAction | null,
  jobs: AutarkOsJob[] = [],
): AppOperationState {
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

export function runtimeControlsDisabled(operationState: AppOperationState, loadingAction: ApplicationRuntimeAction | null) {
  if (loadingAction) {
    return true;
  }
  const kind = operationState?.kind ?? 'idle';
  return kind !== 'idle' && kind !== 'failed';
}

export function applicationActionRestriction(item: Pick<ApplicationSurfaceItem, 'availableActions'>, actionId: string) {
  const action = item.availableActions.find((candidate) => candidate.id === actionId);
  return {
    disabled: Boolean(action?.disabled),
    reason: action?.reason || '',
  };
}

export function runtimeActionDisabled(
  item: Pick<ApplicationSurfaceItem, 'availableActions' | 'operationState'>,
  action: ApplicationRuntimeAction,
  loadingAction: ApplicationRuntimeAction | null,
) {
  return runtimeControlsDisabled(item.operationState, loadingAction) || applicationActionRestriction(item, action).disabled;
}

export function runtimeActionDisabledReason(
  item: Pick<ApplicationSurfaceItem, 'availableActions' | 'name' | 'operationState'>,
  action: ApplicationRuntimeAction,
  loadingAction: ApplicationRuntimeAction | null,
) {
  const restriction = applicationActionRestriction(item, action);
  if (restriction.disabled) return restriction.reason || `This action is unavailable for ${item.name}.`;
  if (loadingAction) return `${runtimeActionLabel(loadingAction)} is already running for ${item.name}.`;
  if (item.operationState.kind !== 'idle' && item.operationState.kind !== 'failed') {
    return item.operationState.currentStep || `${item.operationState.label} is currently running for ${item.name}.`;
  }
  return 'This runtime control is currently available.';
}

function runtimeActionLabel(action: ApplicationRuntimeAction) {
  if (action === 'start') return 'Starting';
  if (action === 'stop') return 'Pausing';
  if (action === 'backup') return 'Backing up';
  if (action === 'repair') return 'Repairing';
  return 'Restarting';
}

export function operationBlocksManagement(operationState: AppOperationState) {
  const kind = operationState?.kind ?? 'idle';
  return kind !== 'idle' && kind !== 'failed';
}

function operationStateFromLocalAction(action: ApplicationRuntimeAction): AppOperationState {
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

function operationStateFromJob(job: AutarkOsJob): AppOperationState {
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

function jobsForItem(item: Pick<ApplicationSurfaceItem, 'id' | 'sourceId'>, jobs: AutarkOsJob[]) {
  const itemIds = new Set([item?.id, item?.sourceId].filter((id): id is string => Boolean(id)));
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => jobTargetsItem(job, itemIds))
    .filter((job) => ['start_app', 'stop_app', 'restart_app', 'repair_app', 'backup', 'backup_verify', 'backup_restore', 'uninstall_app'].includes(job.type))
    .sort((left, right) => jobTime(right) - jobTime(left));
}

function jobTargetsItem(job: AutarkOsJob, itemIds: Set<string>) {
  if (job.subjectId && itemIds.has(job.subjectId)) {
    return true;
  }
  if (job.type !== 'backup_restore') {
    return false;
  }
  const target = restoreTarget(job.subjectId);
  return target === 'all' || itemIds.has(target);
}

function restoreTarget(subjectId?: string | null) {
  if (!subjectId) {
    return '';
  }
  const separator = subjectId.indexOf(':');
  return separator < 0 ? subjectId : subjectId.slice(separator + 1);
}

function failedJobStillRelevant(
  item: Pick<ApplicationSurfaceItem, 'attentionState' | 'readinessState'>,
  job: AutarkOsJob,
) {
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

function isFailedFullRestore(job: AutarkOsJob) {
  return job?.type === 'backup_restore' && job.status === 'failed' && restoreTarget(job.subjectId) === 'all';
}

function currentJobStepText(job: AutarkOsJob) {
  const step = job?.steps?.find((candidate) => candidate.id === job.currentStep)
    ?? job?.steps?.find((candidate) => candidate.status === 'running')
    ?? job?.steps?.find((candidate) => candidate.status === 'pending');
  return step?.message || step?.label || '';
}

function jobTime(job: AutarkOsJob) {
  const parsed = Date.parse(job?.updatedAt || job?.createdAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}
