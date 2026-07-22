import type { ProModuleState } from '@/types/pro';

export type ProReleaseAction = 'check' | 'install' | null;

export function proReleaseAction(
  localUseAllowed: boolean,
  updatesAllowed: boolean,
  moduleState: ProModuleState,
): ProReleaseAction {
  if (!localUseAllowed || !updatesAllowed) return null;
  return moduleState === 'RELEASE_AVAILABLE' ? 'install' : 'check';
}
