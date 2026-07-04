import type { ProStatus } from '@/types/pro';

type ProStatusTone = 'active' | 'disabled' | 'muted' | 'registered';

export type ProStatusViewModel = {
  badge: string;
  heading: string;
  primaryDetail: string;
  tone: ProStatusTone;
};

export function proStatusViewModel(status: ProStatus): ProStatusViewModel {
  if (status.registered && !status.enabled && status.mode !== 'free') {
    return {
      badge: 'Disabled',
      heading: 'Autark Pro is disabled locally',
      primaryDetail: 'This install is registered, but Pro features are turned off on this device.',
      tone: 'disabled',
    };
  }

  if (status.enabled && status.entitlementStatus === 'active') {
    return {
      badge: 'Active',
      heading: status.plan ? `${status.plan} is active` : 'Autark Pro is active',
      primaryDetail: status.accountLinked ? 'This install is linked to an Autark Pro account.' : 'This install is using accountless Pro activation.',
      tone: 'active',
    };
  }

  if (status.registered) {
    return {
      badge: 'Registered',
      heading: 'This install is registered',
      primaryDetail: 'Autark-OS can identify this install when Pro actions are enabled.',
      tone: 'registered',
    };
  }

  return {
    badge: 'Free',
    heading: 'Autark Pro is not registered',
    primaryDetail: 'This install is running locally without Pro registration.',
    tone: 'muted',
  };
}

export function formatProTimestamp(value: string | null) {
  if (!value) {
    return 'Not yet';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
