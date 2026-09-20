import type { DestructiveActionPlan } from './ApplicationsPage.destructiveActions';
import type { ApplicationAction } from '@/types/applicationState';
import type { AppEvent, AppHealthSnapshot, AppSetupGuide, AppTelemetry, AppUsageGuide, ApplicationRuntimeState, AutarkOsIssue } from '@/types/app';

export type ApplicationRuntimeAction = 'start' | 'stop' | 'restart' | 'repair' | 'backup';
export type ApplicationSettingsAction = 'planning' | 'saving' | 'private_access';
export type AppOperationState =
  | { kind: 'idle' }
  | {
    kind: 'installing' | 'starting' | 'stopping' | 'restarting' | 'repairing' | 'saving_settings' | 'backing_up' | 'restoring' | 'uninstalling';
    label: string;
    jobId?: string;
    currentStep?: string;
  }
  | {
    kind: 'failed';
    jobType?: string;
    label: string;
    message: string;
    jobId?: string;
  };

export type ApplicationNextAction = {
  id: 'create_backup' | 'review_issue' | 'start_app';
  label: string;
  description: string;
};

export type ApplicationEmptyState = {
  title: string;
  description: string;
};

export type ApplicationSurfaceItem = {
  id: string;
  sourceId?: string;
  sortKey?: string;
  displayOrder?: number;
  category?: string;
  name: string;
  relationship: 'managed';
  state: ApplicationRuntimeState;
  operation: AppOperationState;
  issues: AutarkOsIssue[];
  access: 'Open' | 'Private' | 'Local only' | 'No link';
  backup: 'Protected' | 'Needs backup' | 'Not managed';
  availableActions: ApplicationAction[];
  catalogAppId?: string | null;
  nextAction?: ApplicationNextAction;
  description: string;
  href?: string;
  iconUrl?: string;
  lastEvent?: string;
  links: ApplicationLinksView;
  settings: ApplicationSettingsView;
  runtime: ApplicationRuntimeDetailsView;
};

export type ApplicationActionHandlers = {
  onCreateBackup: (id: string) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onLoadUninstallPlan: (id: string) => Promise<DestructiveActionPlan>;
  onRepair: (id: string) => void;
  onRestart: (id: string) => void;
  onRunUninstall: (id: string) => Promise<void>;
  onSaveSettings: (id: string, values: ApplicationSettingsFormValues) => Promise<void>;
  onSettingsPlanRequest: (id: string, values: ApplicationSettingsFormValues) => Promise<ApplicationSettingsImpact | null>;
  onSetPrivateNetworkAccess: (id: string, enabled: boolean) => Promise<void>;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
};

export type ApplicationSettingsFormValues = {
  autoRepairEnabled: boolean;
  backupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupRetention: number;
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
