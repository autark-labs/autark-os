import type { DiscoverInstalledAppSummary } from './discover';
import type { ObservedServiceView } from './observedService';

export type AppOwnershipState =
  | 'available'
  | 'installed_managed'
  | 'pinned_external'
  | 'found_on_server'
  | 'recoverable'
  | 'managed_elsewhere'
  | 'blocked'
  | 'failed_install'
  | 'coming_soon'
  | string;

export type AppOwnershipTone = 'neutral' | 'success' | 'info' | 'observed' | 'warning' | 'danger' | 'muted' | string;

export type AppOwnershipAction = {
  id: string;
  label: string;
  kind: 'route' | 'external' | 'install' | 'disabled' | string;
  href: string | null;
  method: string | null;
  disabled: boolean;
  reason: string;
};

export type AppOwnershipView = {
  catalogAppId: string;
  name: string;
  category: string;
  image: string;
  summary: string;
  description: string;
  state: AppOwnershipState;
  stateLabel: string;
  stateDescription: string;
  statusTone: AppOwnershipTone;
  cardTone: AppOwnershipTone;
  installed: boolean;
  ownedByCurrentInstance: boolean;
  installCopyWarningRequired: boolean;
  reviewExistingHref: string | null;
  primaryAction: AppOwnershipAction;
  availableActions: AppOwnershipAction[];
  installedApp: DiscoverInstalledAppSummary | null;
  observedService: ObservedServiceView | null;
};
