import type { ProjectOsJob } from '@/types/jobs';
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
  jobs: ProjectOsJob[],
): AppOperationState;

export function runtimeControlsDisabled(
  operationState: AppOperationState,
  loadingAction: ApplicationRuntimeAction | null,
): boolean;
