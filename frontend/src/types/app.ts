export type BackupPolicy = {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | string;
  retention: number;
};

export type InstallSettings = {
  accessUrl: string | null;
  privateAccessUrl: string | null;
  tailscaleEnabled: boolean;
  storageSubfolders: Record<string, string>;
  backup: BackupPolicy;
  desiredAccessMode?: 'local' | 'private' | 'local-and-private' | 'network' | 'public' | 'none' | string | null;
  privateAccessRequirement?: 'required' | 'recommended' | 'optional' | 'disabled' | string | null;
  expectedLocalPort?: number | null;
  expectedProtocol?: 'http' | 'https' | string | null;
  lastAccessCheckAt?: string | null;
  lastSuccessfulAccessAt?: string | null;
  lastRepairAttemptAt?: string | null;
  lastRepairStatus?: string | null;
  autoRepairEnabled?: boolean;
};

export type AccessDesiredState = {
  mode: 'local' | 'private' | 'local-and-private' | 'network' | 'public' | 'none' | string;
  label: string;
  localUrl: string | null;
  privateUrl: string | null;
  expectedLocalPort: number | null;
  expectedProtocol: 'http' | 'https' | string;
  privateAccessRequirement: 'required' | 'recommended' | 'optional' | 'disabled' | string;
  privateAccessRequired: boolean;
  privateAccessRecommended: boolean;
};

export type AccessObservedState = {
  localUrl: string | null;
  privateUrl: string | null;
  localPort: number | null;
  protocol: 'http' | 'https' | string;
  privateLinkStatus: 'configured' | 'missing' | 'not_enabled' | string;
  lastAccessCheckAt: string | null;
  lastSuccessfulAccessAt: string | null;
  lastRepairAttemptAt: string | null;
  lastRepairStatus: string | null;
};

export type AppTelemetry = {
  cpuPercent: string;
  memoryUsage: string;
  memoryPercent: string;
  networkIo: string;
  blockIo: string;
  checkedAt: string;
};

export type AppAccessCheck = {
  appId: string;
  url: string | null;
  status: 'reachable' | 'unreachable' | 'not_configured' | string;
  message: string;
  checkedAt: string;
};

export type AppHealthSnapshot = {
  appId: string;
  status: 'Ready' | 'Starting' | 'Needs attention' | 'Paused' | 'Unavailable' | string;
  message: string;
  detail: string;
  dockerStatus: string;
  localAccessStatus: string;
  privateAccessStatus: string;
  startupGrace: boolean;
  checkedAt: string;
};

export type AppEvent = {
  id: number;
  appId: string;
  type: string;
  message: string;
  createdAt: string;
};

export type AppConfigurationItem = {
  label: string;
  value: string;
};

export type AppUsageValue = {
  label: string;
  value: string;
  sensitive: boolean;
  qr: boolean;
};

export type AppUsageGuide = {
  kind: 'web-app' | 'companion-service' | 'admin-service' | 'background-service' | 'infrastructure' | string;
  primaryAction: string;
  openUrlLabel: string;
  headline: string;
  summary: string;
  setupSteps: string[];
  values: AppUsageValue[];
  notes: string[];
};

export type AppSetupField = {
  label: string;
  value: string;
  sensitive: boolean;
  qr: boolean;
  recoverable: boolean;
};

export type AppSetupIntegration = {
  id: string;
  name: string;
  targetAppId: string;
  status: 'ready' | 'missing' | 'available' | string;
  description: string;
  requiresApproval: boolean;
  plannedActions: string[];
};

export type AppSetupGuide = {
  kind: 'basic' | 'companion' | 'dashboard' | 'integration' | 'media-stack' | 'infrastructure' | string;
  automation: 'manual' | 'guided' | 'ready' | 'planned' | string;
  generatedValues: AppSetupField[];
  copyableFields: AppSetupField[];
  qrFields: AppSetupField[];
  integrations: AppSetupIntegration[];
  userSteps: string[];
  automationCapabilities: string[];
};

export type AppRuntimeView = {
  appId: string;
  appName: string;
  category: string;
  description: string;
  version: string;
  image: string | null;
  friendlyStatus: 'Ready' | 'Starting' | 'Stopped' | 'Needs attention' | string;
  technicalStatus: string;
  healthCheck: string;
  runtimePath: string;
  composeProject: string;
  accessUrl: string | null;
  desiredAccess: AccessDesiredState | null;
  observedAccess: AccessObservedState | null;
  installedAt: string;
  lastBackup: string;
  settings: InstallSettings | null;
  telemetry: AppTelemetry | null;
  healthSnapshot: AppHealthSnapshot | null;
  usageGuide: AppUsageGuide | null;
  setupGuide: AppSetupGuide | null;
  appConfiguration: AppConfigurationItem[];
  recentEvents: AppEvent[];
};

export type AppSettingsChangePlan = {
  appId: string;
  appName: string;
  impact: 'database_only' | 'restart_required' | 'redeploy_required' | 'data_migration_required' | 'manual' | string;
  headline: string;
  summary: string;
  saveAllowed: boolean;
  redeployRequired: boolean;
  restartRequired: boolean;
  dataMigrationRequired: boolean;
  changes: string[];
  warnings: string[];
  blockedReasons: string[];
};

export type AppActionResult = {
  appId?: string;
  action?: string;
  status?: string;
  message: string;
  app?: AppRuntimeView | null;
  output?: string[];
  completedAt?: string;
};

export type AppUpdateStatus = {
  appId: string;
  appName: string;
  currentImage: string;
  targetImage: string;
  currentVersion: string;
  targetVersion: string;
  updateAvailable: boolean;
  updateChannel: string;
  releaseNotesUrl: string | null;
  sourceUrl: string | null;
  registryAdvisory: string;
  registryStrategy: string;
  risk: 'low' | 'medium' | 'high' | string;
  backupRequired: boolean;
  backupCheckpointStatus: string;
  rollbackAvailable: boolean;
  rollbackSupport: string;
  checkedAt: string;
};

export type AppUpdatePlan = {
  appId: string;
  appName: string;
  currentImage: string;
  targetImage: string;
  risk: string;
  updateAvailable: boolean;
  updateChannel: string;
  releaseNotesUrl: string | null;
  sourceUrl: string | null;
  registryStrategy: string;
  backupCheckpointStatus: string;
  rollbackSupport: string;
  steps: string[];
  warnings: string[];
  executable: boolean;
  plannedAt: string;
};

export type AppUpdateResult = {
  appId: string;
  appName: string;
  status: 'completed' | 'rolled_back' | 'skipped' | 'failed' | string;
  message: string;
  logs: string[];
  app: AppRuntimeView | null;
  completedAt: string;
};

export type AppReliabilityIssue = {
  appId: string;
  appName: string;
  status: string;
  message: string;
  detail: string;
  suggestedAction: string;
  repairAvailable: boolean;
  checkedAt: string;
};

export type AppReliabilityActivity = {
  id: number;
  appId: string;
  appName: string;
  type: string;
  message: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | string;
  createdAt: string;
};

export type AppReliabilitySummary = {
  posture: 'healthy' | 'warning' | 'critical' | string;
  headline: string;
  summary: string;
  totalApps: number;
  readyApps: number;
  startingApps: number;
  pausedApps: number;
  needsAttentionApps: number;
  unavailableApps: number;
  privateApps: number;
  autoRepairEnabledApps: number;
  recentSuccessfulRepairs: number;
  recentFailedRepairs: number;
  issues: AppReliabilityIssue[];
  recentActivity: AppReliabilityActivity[];
  checkedAt: string;
};

export type UninstallPlan = {
  appId: string;
  appName: string;
  headline: string;
  safetyCheckpointPlanned?: boolean;
  safetyCheckpointMessage?: string;
  willStop: string[];
  willKeep: string[];
  requiresConfirmation: string[];
  needsConfirmation?: string[];
};
