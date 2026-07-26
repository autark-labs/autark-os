import type { ProStatusResponse } from '@/api/pro';
import type { ProProductState } from '@/api/proProductState';

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

const entitlementCopy: Record<ProProductState['softwareEntitlement']['state'], { description: string; title: string }> = {
  absent: {
    title: 'Activate Autark Pro',
    description: 'This appliance is using Community Edition. Activate Pro when you are ready.',
  },
  activating: {
    title: 'Finish Autark Pro activation',
    description: 'Autark-OS is completing the secure activation for this appliance.',
  },
  active: {
    title: 'Autark Pro is available',
    description: 'Local Pro features and the currently eligible update channel are available.',
  },
  grace: {
    title: 'Autark Pro is available locally',
    description: 'Autark-OS is using the last verified entitlement while it reconnects to Autark services.',
  },
  retained_use: {
    title: 'Autark Pro remains available locally',
    description: 'Your purchased local Pro release continues to work. New private-extension updates and hosted services are unavailable.',
  },
  suspended: {
    title: 'Autark Pro needs an entitlement check',
    description: 'Local Pro capabilities are paused until this appliance can verify its entitlement again.',
  },
  revoked: {
    title: 'Autark Pro is inactive',
    description: 'This appliance is safely using Community Edition. You can review its license status without losing data.',
  },
  invalid: {
    title: 'Autark Pro needs attention',
    description: 'Autark-OS could not verify the local Pro entitlement and has safely kept Community Edition available.',
  },
  error: {
    title: 'Autark Pro status is unavailable',
    description: 'Autark-OS could not read the Pro lifecycle state. Community Edition remains available.',
  },
};

const moduleCopy: Record<ProProductState['agent']['state'], string> = {
  not_installed: 'No private extension is installed yet.',
  release_available: 'A signed private extension release is ready to install.',
  installing: 'Autark-OS is safely preparing the signed private extension.',
  active: 'The signed private extension is healthy on this appliance.',
  degraded: 'The private extension needs attention. Community Edition remains available.',
  retained_use: 'The installed private extension remains available, but it is outside its update term.',
  update_ineligible: 'This appliance can keep its installed private extension but cannot install newer releases.',
  removing: 'Autark-OS is removing the private extension safely.',
  error: 'The private extension needs recovery. Community Edition remains available.',
};

export function proLifecycleModel(status: ProStatusResponse, product: ProProductState): ProLifecycleModel {
  const entitlement = entitlementCopy[product.softwareEntitlement.state];
  const moduleDescription = product.agent.reasonCode === 'rolling_back'
    ? 'Autark-OS is restoring the last known-good private extension.'
    : moduleCopy[product.agent.state];
  const primaryAction = primaryActionFor(product);

  return {
    canDeactivate: status.device.registered && status.activation.state === 'idle',
    canRefreshEntitlement: product.softwareEntitlement.state !== 'absent'
      && status.activation.state === 'idle',
    canRemoveModule: status.module.state !== 'NOT_INSTALLED'
      && status.module.state !== 'REMOVING'
      && !status.module.jobId,
    description: `${entitlement.description} ${moduleDescription}`,
    primaryAction,
    reason: redactedLifecycleReason(product),
    title: entitlement.title,
  };
}

function primaryActionFor(product: ProProductState): ProLifecyclePrimaryAction {
  const actions: Record<string, ProLifecyclePrimaryAction> = {
    activate: 'activate',
    check_release: 'check-release',
    continue_activation: 'continue-activation',
    install_release: 'install-release',
  };
  return actions[product.recommendedAction.id] ?? 'none';
}

function redactedLifecycleReason(product: ProProductState) {
  if (product.agent.state === 'error' || product.agent.state === 'degraded') {
    return 'The private extension reported a recoverable lifecycle problem. Check for a signed release or remove the extension if recovery does not succeed.';
  }
  return product.recommendedAction.id === 'none'
    ? null
    : 'Autark-OS is showing the safest available local state. No appliance data was removed.';
}
