export type ObservedServiceUserStatus =
  | 'installed_managed'
  | 'found_on_server'
  | 'recoverable'
  | 'managed_elsewhere'
  | 'blocked'
  | 'failed_install'
  | 'available'
  | 'coming_soon'
  | string;

export type ObservedServiceAction = {
  id: string;
  label: string;
  kind: 'route' | 'external' | 'mutation' | 'disabled' | string;
  href: string | null;
  method: string | null;
  disabled: boolean;
  reason: string;
};

export type ObservedServiceManagementState = 'managed' | 'found' | string;
export type ObservedServiceReadinessState = 'ready' | 'starting' | 'paused' | 'stopped' | 'unreachable' | 'unknown' | string;
export type ObservedServiceAttentionState = 'none' | 'needs_review' | 'conflict' | 'blocked' | string;

export type ObservedServiceView = {
  id: string;
  source: string;
  displayName: string;
  url: string | null;
  category: string;
  accessScope: string;
  catalogAppId: string | null;
  catalogMatchConfidence: string;
  userStatus: ObservedServiceUserStatus;
  userStatusLabel: string;
  userStatusDescription: string;
  managementState?: ObservedServiceManagementState;
  readinessState?: ObservedServiceReadinessState;
  attentionState?: ObservedServiceAttentionState;
  ownershipState: string;
  runtimeState: string;
  managedByThisAutarkOs: boolean;
  recoveryCandidate: boolean;
  availableActions: ObservedServiceAction[];
  metadata: Record<string, string>;
};
