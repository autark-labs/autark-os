import type { DestructiveActionPlan } from './ApplicationsPage.destructiveActions';
import type { AppEvent, AppHealthSnapshot, AppSetupGuide, AppTelemetry, AppUpdatePlan, AppUsageGuide } from '@/types/app';
import type { ObservedServiceAdoptionPlan } from '@/types/observedService';

export type ApplicationRuntimeState = 'running' | 'starting' | 'paused' | 'needs_attention' | 'found' | 'shortcut';
export type ApplicationRuntimeAction = 'start' | 'stop' | 'restart' | 'repair' | 'backup' | 'update' | 'rollback';
export type ApplicationSettingsAction = 'planning' | 'saving' | 'private_access';
export type AppManagementState = 'managed' | 'found' | 'linked';
export type AppReadinessState = 'ready' | 'starting' | 'paused' | 'stopped' | 'unreachable' | 'unknown';
export type AppAttentionState = 'none' | 'needs_review' | 'conflict' | 'blocked';
export type AppOperationState =
  | { kind: 'idle' }
  | {
    kind: 'starting' | 'stopping' | 'restarting' | 'repairing' | 'saving_settings' | 'backing_up' | 'restoring' | 'uninstalling' | 'updating' | 'rolling_back';
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

export type ApplicationEmptyState = {
  title: string;
  description: string;
};

export type ApplicationAvailableAction = {
  id: string;
  label: string;
  href?: string | null;
  disabled?: boolean;
  reason?: string | null;
};

export type ApplicationSurfaceItem = {
  id: string;
  sourceId?: string;
  sortKey?: string;
  displayOrder?: number;
  category?: string;
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
  availableActions: ApplicationAvailableAction[];
  catalogAppId?: string | null;
  catalogMatchConfidence?: string;
  nextAction?: ApplicationNextAction;
  description: string;
  href?: string;
  iconUrl?: string;
  lastEvent?: string;
  links: ApplicationLinksView;
  settings: ApplicationSettingsView;
  runtime: ApplicationRuntimeDetailsView;
  userStatus?: string;
  userStatusDescription?: string;
  userStatusLabel?: string;
};

export type ApplicationActionHandlers = {
  onCreateBackup: (id: string) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onAdoptObservedService: (serviceId: string, confirmation: string) => Promise<void>;
  onLoadUninstallPlan: (id: string) => Promise<DestructiveActionPlan>;
  onLoadUpdatePlan: (id: string) => Promise<AppUpdatePlan>;
  onLoadRollbackPlan: (id: string) => Promise<AppUpdatePlan>;
  onLoadObservedServiceAdoptionPlan: (serviceId: string) => Promise<ObservedServiceAdoptionPlan>;
  onMatchObservedService: (serviceId: string, catalogAppId: string | null) => Promise<void>;
  onPinObservedService: (serviceId: string) => Promise<void>;
  onRepair: (id: string) => void;
  onRestart: (id: string) => void;
  onRunNextAction: (id: string) => void;
  onRunUninstall: (id: string) => Promise<void>;
  onRunUpdate: (id: string) => Promise<void>;
  onRunRollback: (id: string) => Promise<void>;
  onSaveSettings: (id: string, values: ApplicationSettingsFormValues) => Promise<void>;
  onSettingsPlanRequest: (id: string, values: ApplicationSettingsFormValues) => Promise<ApplicationSettingsImpact | null>;
  onSetPrivateNetworkAccess: (id: string, enabled: boolean) => Promise<void>;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onUnpinObservedService: (serviceId: string) => Promise<void>;
};

export type ApplicationSettingsFormValues = {
  autoRepairEnabled: boolean;
  backupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupRetention: number;
  expectedProtocol: 'http' | 'https';
  localPort: number | null;
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

export type ApplicationRuntimeDetailsView = {
  appConfiguration: { label: string; value: string }[];
  checkedAt?: string;
  composeProject?: string;
  health?: AppHealthSnapshot | null;
  image?: string | null;
  lastBackup?: string;
  recentEvents: AppEvent[];
  runtimePath?: string;
  setupGuide?: AppSetupGuide | null;
  telemetry?: AppTelemetry | null;
  usageGuide?: AppUsageGuide | null;
  version?: string;
};
