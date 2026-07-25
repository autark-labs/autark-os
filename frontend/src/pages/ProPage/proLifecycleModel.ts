import type { ProStatusResponse } from '@/api/pro';
import type { ProEntitlementState, ProModuleState } from '@/types/pro';

export type ProLifecyclePrimaryAction =
  | 'activate'
  | 'check-release'
  | 'continue-activation'
  | 'install-release'
  | 'none';

export type ProLifecycleModel = {
  canDeactivate: boolean;
  canRefreshEntitlement: boolean;
  canRemoveModule: boolean;
  description: string;
  primaryAction: ProLifecyclePrimaryAction;
  reason: string | null;
  title: string;
};

const entitlementCopy: Record<ProEntitlementState, { description: string; title: string }> = {
  NOT_ACTIVATED: {
    title: 'Activate Autark Pro',
    description: 'This appliance is using Community Edition. Activate Pro when you are ready.',
  },
  ACTIVATING: {
    title: 'Finish Autark Pro activation',
    description: 'Autark-OS is completing the secure activation for this appliance.',
  },
  ACTIVE: {
    title: 'Autark Pro is available',
    description: 'Local Pro features and the currently eligible update channel are available.',
  },
  ONLINE_GRACE: {
    title: 'Autark Pro is available locally',
    description: 'Autark-OS is using the last verified entitlement while it reconnects to Autark services.',
  },
  RETAINED_USE: {
    title: 'Autark Pro remains available locally',
    description: 'Your purchased local Pro release continues to work. New private-extension updates and hosted services are unavailable.',
  },
  SUSPENDED_ONLINE: {
    title: 'Autark Pro needs an entitlement check',
    description: 'Local Pro capabilities are paused until this appliance can verify its entitlement again.',
  },
  REVOKED: {
    title: 'Autark Pro is inactive',
    description: 'This appliance is safely using Community Edition. You can review its license status without losing data.',
  },
  INVALID: {
    title: 'Autark Pro needs attention',
    description: 'Autark-OS could not verify the local Pro entitlement and has safely kept Community Edition available.',
  },
  ERROR: {
    title: 'Autark Pro status is unavailable',
    description: 'Autark-OS could not read the Pro lifecycle state. Community Edition remains available.',
  },
};

const moduleCopy: Record<ProModuleState, string> = {
  NOT_INSTALLED: 'No private extension is installed yet.',
  RELEASE_AVAILABLE: 'A signed private extension release is ready to install.',
  DOWNLOADING: 'Autark-OS is downloading the signed private extension.',
  VERIFYING: 'Autark-OS is verifying the signed private extension.',
  STARTING_CANDIDATE: 'Autark-OS is starting the private extension safely.',
  HEALTH_CHECKING: 'Autark-OS is checking the private extension before it becomes active.',
  ACTIVE: 'The signed private extension is healthy on this appliance.',
  DEGRADED: 'The private extension needs attention. Community Edition remains available.',
  ROLLING_BACK: 'Autark-OS is restoring the last known-good private extension.',
  RETAINED_USE: 'The installed private extension remains available, but it is outside its update term.',
  UPDATE_INELIGIBLE: 'This appliance can keep its installed private extension but cannot install newer releases.',
  REMOVING: 'Autark-OS is removing the private extension safely.',
  ERROR: 'The private extension needs recovery. Community Edition remains available.',
};

export function proLifecycleModel(status: ProStatusResponse): ProLifecycleModel {
  const entitlement = entitlementCopy[status.entitlement.state];
  const moduleDescription = moduleCopy[status.module.state];
  const primaryAction = primaryActionFor(status);

  return {
    canDeactivate: status.device.registered && status.activation.state === 'idle',
    canRefreshEntitlement: status.entitlement.state !== 'NOT_ACTIVATED'
      && status.activation.state === 'idle',
    canRemoveModule: status.module.state !== 'NOT_INSTALLED'
      && status.module.state !== 'REMOVING'
      && !status.module.jobId,
    description: `${entitlement.description} ${moduleDescription}`,
    primaryAction,
    reason: redactedLifecycleReason(status),
    title: entitlement.title,
  };
}

function primaryActionFor(status: ProStatusResponse): ProLifecyclePrimaryAction {
  if (status.activation.activationId) return 'continue-activation';
  if (status.entitlement.state === 'NOT_ACTIVATED') return 'activate';
  if (!status.entitlement.localUseAllowed || !status.entitlement.updatesAllowed) return 'none';
  if (status.module.state === 'RELEASE_AVAILABLE') return 'install-release';
  if (['NOT_INSTALLED', 'ACTIVE', 'DEGRADED', 'ERROR'].includes(status.module.state)) {
    return 'check-release';
  }
  return 'none';
}

function redactedLifecycleReason(status: ProStatusResponse) {
  if (status.module.errorCode) {
    return 'The private extension reported a recoverable lifecycle problem. Check for a signed release or remove the extension if recovery does not succeed.';
  }
  return status.entitlement.reasonCode === 'active'
    || status.entitlement.reasonCode === 'grant'
    ? null
    : 'Autark-OS is showing the safest available local state. No appliance data was removed.';
}
