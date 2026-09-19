import type {
  ApplicationRuntimeAction,
  ApplicationSurfaceItem,
  AppOperationState,
} from './ApplicationsPage.types';

export function runtimeControlsDisabled(operation: AppOperationState, loadingAction: ApplicationRuntimeAction | null) {
  if (loadingAction) return true;
  return operation.kind !== 'idle' && operation.kind !== 'failed';
}

export function applicationActionRestriction(item: Pick<ApplicationSurfaceItem, 'availableActions'>, actionId: string) {
  const action = item.availableActions.find((candidate) => candidate.id === actionId);
  return {
    disabled: Boolean(action?.disabled),
    reason: action?.reason || '',
  };
}

export function runtimeActionDisabled(
  item: Pick<ApplicationSurfaceItem, 'availableActions' | 'operation'>,
  action: ApplicationRuntimeAction,
  loadingAction: ApplicationRuntimeAction | null,
) {
  return runtimeControlsDisabled(item.operation, loadingAction) || applicationActionRestriction(item, action).disabled;
}

export function runtimeActionDisabledReason(
  item: Pick<ApplicationSurfaceItem, 'availableActions' | 'name' | 'operation'>,
  action: ApplicationRuntimeAction,
  loadingAction: ApplicationRuntimeAction | null,
) {
  const restriction = applicationActionRestriction(item, action);
  if (restriction.disabled) return restriction.reason || `This action is unavailable for ${item.name}.`;
  if (loadingAction) return `${runtimeActionLabel(loadingAction)} is already running for ${item.name}.`;
  if (item.operation.kind !== 'idle' && item.operation.kind !== 'failed') {
    return item.operation.currentStep || `${item.operation.label} is currently running for ${item.name}.`;
  }
  return 'This runtime control is currently available.';
}

export function operationBlocksManagement(operation: AppOperationState) {
  return operation.kind !== 'idle' && operation.kind !== 'failed';
}

function runtimeActionLabel(action: ApplicationRuntimeAction) {
  if (action === 'start') return 'Starting';
  if (action === 'stop') return 'Pausing';
  if (action === 'backup') return 'Backing up';
  if (action === 'repair') return 'Repairing';
  if (action === 'update') return 'Updating';
  if (action === 'rollback') return 'Rolling back';
  return 'Restarting';
}
