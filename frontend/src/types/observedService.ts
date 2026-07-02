import type { ApplicationState } from './applicationState';

export type ObservedServiceUserStatus =
  | 'installed_managed'
  | 'pinned_external'
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

export type ObservedServiceManagementState = 'managed' | 'found' | 'linked' | string;
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
  pinned: boolean;
  managedByThisProjectOs: boolean;
  adoptable: boolean;
  duplicateInstallWarningRequired: boolean;
  availableActions: ObservedServiceAction[];
  metadata: Record<string, string>;
};

export type ObservedServiceActionResult = {
  ok: boolean;
  severity: 'success' | 'info' | 'warning' | 'error' | string;
  title: string;
  message?: string | null;
  subjectId?: string | null;
  resourceId?: string | null;
  nextAction?: string | null;
  applicationState?: ApplicationState | null;
};

export type ObservedServiceAdoptionPlan = {
  serviceId?: string;
  displayName?: string;
  available?: boolean;
  summary?: string;
  confirmationText?: string;
  blockedReasons?: string[];
  warnings?: string[];
  steps?: string[];
  containers?: string[];
  catalogAppId?: string | null;
  labels?: string[];
  labelsToApply?: string[];
  dataPaths?: string[];
  dataPreservation?: string;
  restartRequired?: boolean;
  safetyCheckpointAvailable?: boolean;
  disabledReason?: string | null;
  [key: string]: unknown;
};
