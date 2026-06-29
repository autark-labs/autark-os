import type { DestructiveActionPlan } from './ApplicationsPage.destructiveActions';

export type ApplicationRuntimeState = 'running' | 'starting' | 'paused' | 'needs_attention' | 'found' | 'shortcut';
export type ApplicationRuntimeAction = 'start' | 'stop' | 'restart';
export type ApplicationSettingsAction = 'planning' | 'saving';
export type AppManagementState = 'managed' | 'found' | 'linked';
export type AppReadinessState = 'ready' | 'starting' | 'paused' | 'stopped' | 'unreachable' | 'unknown';
export type AppAttentionState = 'none' | 'needs_review' | 'conflict' | 'blocked';
export type AppOperationState =
  | { kind: 'idle' }
  | {
    kind: 'starting' | 'stopping' | 'restarting' | 'saving_settings' | 'backing_up' | 'uninstalling';
    label: string;
    jobId?: string;
    currentStep?: string;
  }
  | {
    kind: 'failed';
    label: string;
    message: string;
    jobId?: string;
  };

export type ApplicationNextAction = {
  id: 'create_backup' | 'review_found_service' | 'review_issue' | 'start_app';
  label: string;
  description: string;
};

export type ApplicationSurfaceItem = {
  id: string;
  sourceId?: string;
  name: string;
  kind: 'managed' | 'pinned' | 'observed';
  managementState: AppManagementState;
  readinessState: AppReadinessState;
  attentionState: AppAttentionState;
  operationState: AppOperationState;
  status: 'Ready' | 'Starting' | 'Paused' | 'Needs review' | 'Found' | 'Pinned';
  runtimeState: ApplicationRuntimeState;
  access: 'Open' | 'Private' | 'Local only' | 'No link';
  backup: 'Protected' | 'Needs backup' | 'Not managed';
  nextAction?: ApplicationNextAction;
  description: string;
  href?: string;
  iconUrl?: string;
  lastEvent?: string;
  links: ApplicationLinksView;
  settings: ApplicationSettingsView;
};

export type ApplicationActionHandlers = {
  onCreateBackup: (id: string) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onLoadUninstallPlan: (id: string) => Promise<DestructiveActionPlan>;
  onRestart: (id: string) => void;
  onRunNextAction: (id: string) => void;
  onRunUninstall: (id: string) => Promise<void>;
  onSaveSettings: (id: string, values: ApplicationSettingsFormValues) => Promise<void>;
  onSettingsPlanRequest: (id: string, values: ApplicationSettingsFormValues) => Promise<ApplicationSettingsImpact | null>;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
};

export type ApplicationSettingsFormValues = {
  autoRepairEnabled: boolean;
  backupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupRetention: number;
  expectedProtocol: 'http' | 'https';
  localPort: number | null;
  tailscaleEnabled: boolean;
};

export type ApplicationSettingsImpact = {
  blockedReasons: string[];
  changes: string[];
  headline: string;
  redeployRequired: boolean;
  restartRequired: boolean;
  saveAllowed: boolean;
  summary: string;
  warnings: string[];
};

export type ApplicationSettingsView = {
  autoRepairEnabled: boolean;
  canEdit: boolean;
  containerDetail: string;
  containerStatus: string;
  desiredAccessMode: string;
  expectedLocalPort: number | null;
  expectedProtocol: 'http' | 'https' | string;
  backupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly' | string;
  backupRetention: number;
  privateAccessRequired: boolean;
  privateAccessUrl?: string;
  privateLinkStatus: string;
  tailscaleEnabled: boolean;
};

export type ApplicationLinksView = {
  backendTargetUrl?: string;
  localUrl?: string;
  primaryUrl?: string;
  privateUrl?: string;
};
