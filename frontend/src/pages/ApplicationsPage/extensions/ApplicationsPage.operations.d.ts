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

export function operationBlocksManagement(
  operationState: AppOperationState,
): boolean;
