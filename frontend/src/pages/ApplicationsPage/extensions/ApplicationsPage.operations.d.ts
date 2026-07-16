import type { AutarkOsJob } from '@/types/jobs';
import type {
  ApplicationRuntimeAction,
  ApplicationSettingsAction,
  ApplicationSurfaceItem,
  AppOperationState,
} from './ApplicationsPage.types';

export function operationStateForItem(
  item: Pick<ApplicationSurfaceItem, 'id' | 'sourceId'>,
  localAction: ApplicationRuntimeAction | null,
  settingsAction: ApplicationSettingsAction | null,
  jobs: AutarkOsJob[],
): AppOperationState;

export function runtimeControlsDisabled(
  operationState: AppOperationState,
  loadingAction: ApplicationRuntimeAction | null,
): boolean;

export function applicationActionRestriction(
  item: Pick<ApplicationSurfaceItem, 'availableActions'>,
  actionId: string,
): { disabled: boolean; reason: string };

export function runtimeActionDisabled(
  item: Pick<ApplicationSurfaceItem, 'availableActions' | 'operationState'>,
  action: ApplicationRuntimeAction,
  loadingAction: ApplicationRuntimeAction | null,
): boolean;

export function runtimeActionDisabledReason(
  item: Pick<ApplicationSurfaceItem, 'availableActions' | 'name' | 'operationState'>,
  action: ApplicationRuntimeAction,
  loadingAction: ApplicationRuntimeAction | null,
): string;

export function operationBlocksManagement(
  operationState: AppOperationState,
): boolean;
