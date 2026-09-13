import type { AppRuntimeView, AutarkOsIssue } from './app';
import type { ObservedServiceView } from './observedService';

export type ApplicationRelationship = 'managed' | 'recovery_required' | 'blocked' | 'available';
export type CatalogAvailability = 'installable' | 'unavailable_in_beta' | string;
export type ApplicationTone = 'neutral' | 'success' | 'warning' | 'danger' | 'muted' | string;

export type ApplicationAction = {
  id: string;
  label: string;
  kind: 'route' | 'external' | 'install' | 'disabled' | string;
  href: string | null;
  method: string | null;
  disabled: boolean;
  reason: string;
};

export type ApplicationView = {
  id: string;
  name: string;
  category: string;
  image: string;
  summary: string;
  description: string;
  relationship: ApplicationRelationship;
  catalogAvailability: CatalogAvailability;
  appInstanceId: string;
  runtimeState: string;
  ownershipState: string;
  accessState: string;
  backupState: string;
  issues: AutarkOsIssue[];
  relationshipLabel: string;
  relationshipDescription: string;
  statusTone: ApplicationTone;
  cardTone: ApplicationTone;
  installCopyWarningRequired: boolean;
  reviewExistingHref: string | null;
  primaryAction: ApplicationAction;
  availableActions: ApplicationAction[];
  runtime: AppRuntimeView | null;
  evidence: ObservedServiceView | null;
};

export type ApplicationState = {
  applications: ApplicationView[];
  updatedAt: string | null;
  stale?: boolean;
  refreshStatus?: 'idle' | 'running' | 'stale' | 'error' | string;
  refreshStartedAt?: string | null;
  refreshCompletedAt?: string | null;
  nextRefreshAt?: string | null;
  lastError?: string | null;
};

export type ApplicationStateFreshnessPhase = 'checking' | 'current' | 'refreshing' | 'stale' | 'unavailable';

export type ApplicationStateFreshness = {
  hasUsableData: boolean;
  isCurrent: boolean;
  lastSuccessfulUpdate: Date | null;
  phase: ApplicationStateFreshnessPhase;
};
