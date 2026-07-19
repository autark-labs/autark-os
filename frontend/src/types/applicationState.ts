import type { AppInstanceView, AppRuntimeView } from './app';
import type { AppOwnershipView } from './appOwnership';
import type { ObservedServiceView } from './observedService';

export type ApplicationState = {
  managedApps: AppInstanceView[];
  runtimeApps: AppRuntimeView[];
  observedServices: ObservedServiceView[];
  pinnedExternalServices: ObservedServiceView[];
  foundServices: ObservedServiceView[];
  ownershipViews: AppOwnershipView[];
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
