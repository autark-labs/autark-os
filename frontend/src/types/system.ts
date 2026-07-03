import type { AutarkOsAction, AutarkOsIssue } from './app';

export type SystemMetrics = {
  deviceName: string;
  runAsUser: string;
  osName: string;
  osVersion: string;
  osArchitecture: string;
  javaVersion: string;
  availableProcessors: number;
  systemCpuPercent: number;
  processCpuPercent: number;
  systemLoadAverage: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryPercent: number;
  runtimeRoot: string;
  runtimeTotalBytes: number;
  runtimeUsableBytes: number;
  runtimeUsedPercent: number;
  checkedAt: string;
};

export type SetupProgressSummary = {
  complete: boolean;
  status: string;
  nextStep: string;
  summary: string;
};

export type DockerSummary = {
  ready: boolean;
  summary: string;
};

export type AccessSummary = {
  mode: string;
  summary: string;
};

export type ReadyAppSummary = {
  appInstanceId: string;
  name: string;
  url: string;
};

export type AppsSummary = {
  installed: number;
  running: number;
  needsAttention: number;
  readyToOpen: ReadyAppSummary[];
};

export type BackupSummary = {
  state: string;
  summary: string;
};

export type StorageSummary = {
  state: string;
  summary: string;
};

export type SystemSummary = {
  deviceName: string;
  instanceId: string;
  lanUrl: string;
  setup: SetupProgressSummary;
  docker: DockerSummary;
  access: AccessSummary;
  apps: AppsSummary;
  backups: BackupSummary;
  storage: StorageSummary;
  issues: AutarkOsIssue[];
  updatedAt: string;
};

export type RecommendedAction = {
  id: string;
  severity: 'success' | 'info' | 'warning' | 'critical' | string;
  title: string;
  body: string;
  primaryAction?: AutarkOsAction | null;
  secondaryAction?: AutarkOsAction | null;
  sourceIssueIds: string[];
  dismissible: boolean;
};

export type SetupProgress = {
  setupVersion: number;
  completedSteps: string[];
  skippedSteps: string[];
  lastRecommendedStep: string;
  setupComplete: boolean;
  updatedAt: string;
};

export type SetupStatus = {
  setupComplete: boolean;
  currentStep: 'host_check' | 'existing_apps' | 'tailscale' | 'starter_apps' | 'first_backup' | 'done' | string;
  message: string;
};

export type SystemSetupCheck = {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'neutral' | string;
  message: string;
  detail: string;
  actionLabel: string | null;
  actionCommand: string | null;
};

export type SystemSetupStatus = {
  status: 'ready' | 'ready_with_notes' | 'needs_admin_setup' | string;
  headline: string;
  summary: string;
  runAsUser: string;
  expectedUser: string;
  devMode: boolean;
  activeProfiles: string;
  backendPort: string;
  backendContextPath: string;
  dockerVersion: string;
  tailscaleVersion: string;
  instanceId: string;
  instanceSlug: string;
  existingInstall: SystemSetupExistingInstallReport;
  installCommand: string;
  checks: SystemSetupCheck[];
  checkedAt: string;
};

export type SystemSetupExistingInstallReport = {
  conflict: boolean;
  developmentInstanceAllowed: boolean;
  severity: 'ok' | 'info' | 'warning' | 'error' | string;
  headline: string;
  summary: string;
  resources: SystemSetupExistingInstallResource[];
  actions: SystemSetupAction[];
};

export type SystemSetupExistingInstallResource = {
  id: string;
  label: string;
  kind: string;
  ownershipState: string;
  ownerInstanceId: string;
  summary: string;
  route: string;
};

export type SystemSetupAction = {
  id: string;
  label: string;
  route: string;
  style: 'primary' | 'secondary' | string;
};

export type SystemDoctorStatus = {
  status: 'ready' | 'needs_attention' | string;
  headline: string;
  summary: string;
  readiness: SystemReadinessStatus;
  checks: SystemSetupCheck[];
  repairableChecks: SystemSetupCheck[];
  detectedOs: string;
  packageManager: string;
  automatedDependencyInstallSupported: boolean;
  lanUrl: string;
  checkedAt: string;
};

export type SystemReadinessGroup = {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'neutral' | string;
  message: string;
  checks: SystemSetupCheck[];
};

export type SystemReadinessStatus = {
  status: 'ready' | 'apps_need_docker' | 'private_access_needs_tailscale' | 'storage_needs_review' | 'warnings_only' | string;
  headline: string;
  summary: string;
  canCompleteOnboarding: boolean;
  finishAnywayRequiresAdvanced: boolean;
  groups: SystemReadinessGroup[];
};

export type OnboardingState = {
  status: 'not_started' | 'in_progress' | 'complete' | string;
  currentStep: number;
  deviceName: string;
  runtimePath: string;
  backupDestination: string;
  tailscaleConnected: boolean;
  privateAccessChoice: 'setup-now' | 'local-only' | 'already-connected' | string;
  automaticBackupsEnabled: boolean;
  recommendedApps: string[];
  completedSteps: string[];
  doctor: SystemDoctorStatus;
  updatedAt: string;
};

export type OnboardingUpdateRequest = {
  status?: string;
  currentStep?: number;
  deviceName?: string;
  backupDestination?: string;
  automaticBackupsEnabled?: boolean;
  privateAccessChoice?: string;
  recommendedApps?: string[];
  completedSteps?: string[];
};

export type ProjectVersionInfo = {
  version: string;
  buildSha: string;
  buildDate: string;
  installPath: string;
  runtimePath: string;
  backendJar: string;
  updateChannel: string;
  updateStatus: 'unavailable' | 'available' | 'current' | string;
  updateMessage: string;
  checkedAt: string;
};

export type ProjectSettings = {
  deviceName: string;
  timeZone: string;
  language: string;
  temperatureUnit: 'fahrenheit' | 'celsius' | string;
  dateFormat: string;
  timeFormat: '12-hour' | '24-hour' | string;
  startOnBoot: boolean;
  telemetryEnabled: boolean;
  defaultInstallAccess: 'manifest-default' | 'local' | 'private' | 'local-and-private' | string;
  automaticRepairEnabled: boolean;
  automaticBackupsEnabled: boolean;
  backupFrequency: 'hourly' | 'daily' | 'weekly' | string;
  backupRetentionDays: number;
  backupTime: string;
  updateChannel: 'stable' | 'preview' | string;
  showAdvancedMetrics: boolean;
  updatedAt: string;
};

export type ProjectSettingsAppDefaultsResult = {
  ok: boolean;
  severity: 'success' | 'info' | 'warning' | 'error' | string;
  title: string;
  message: string;
  updatedApps: number;
  completedAt: string;
};

export type StorageUsage = {
  label: string;
  path: string;
  totalBytes: number;
  usableBytes: number;
  usedBytes: number;
  usedPercent: number;
};

export type AppStorageUsage = {
  appId: string;
  appName: string;
  status: string;
  path: string;
  usedBytes: number;
  sevenDayGrowthBytes: number;
  trend: StorageTrendPoint[];
  backupEnabled: boolean;
  backupFrequency: string;
  lastBackup: string;
};

export type StorageTrendPoint = {
  usedBytes: number;
  sampledAt: string;
};

export type OrphanedStorage = {
  name: string;
  path: string;
  usedBytes: number;
};

export type StorageRecommendation = {
  id: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | string;
  title: string;
  message: string;
  actionLabel: string | null;
};

export type InstallStorageSafety = {
  status: 'ready' | 'warning' | string;
  message: string;
  minimumRecommendedFreeBytes: number;
  currentFreeBytes: number;
  installAllowed: boolean;
};

export type StorageReport = {
  status: 'healthy' | 'warning' | 'critical' | string;
  headline: string;
  summary: string;
  hostDisk: StorageUsage;
  runtimeDisk: StorageUsage;
  backupStorage: StorageUsage;
  apps: AppStorageUsage[];
  orphanedData: OrphanedStorage[];
  recommendations: StorageRecommendation[];
  installSafety: InstallStorageSafety;
  checkedAt: string;
};

export type StorageCleanupResult = {
  status: 'completed' | 'failed' | string;
  message: string;
  removedName: string;
  removedPath: string;
  removedBytes: number;
  safetyCheckpointPath: string;
  completedAt: string;
};

export type SupportCommand = {
  id: string;
  label: string;
  description: string;
  command: string;
  destination: string;
};

export type SupportLogLine = {
  line: string;
  level: 'info' | 'warning' | 'error' | string;
  redacted: boolean;
};

export type SupportSummary = {
  status: 'ready' | 'ready_with_notes' | 'needs_admin_setup' | string;
  headline: string;
  summary: string;
  redacted: boolean;
  backendHealth: string;
  dockerStatus: string;
  tailscaleStatus: string;
  serviceStatus: string;
  version: ProjectVersionInfo;
  recentFailures: number;
  findings: SupportFinding[];
  unifiedIssues: AutarkOsIssue[];
  redactionRules: SupportRedactionRule[];
  commands: SupportCommand[];
  checkedAt: string;
};

export type SupportFinding = {
  id: string;
  area: string;
  severity: 'info' | 'warning' | 'error' | string;
  title: string;
  message: string;
  actionLabel: string;
  route: string;
};

export type SupportRedactionRule = {
  id: string;
  label: string;
  description: string;
};

export type SupportDomainSummary = {
  id: string;
  label: string;
  status: string;
  headline: string;
  summary: string;
};

export type SupportBundle = {
  status: string;
  headline: string;
  summary: string;
  redacted: boolean;
  backendHealth: string;
  dockerStatus: string;
  tailscaleStatus: string;
  serviceStatus: string;
  version: ProjectVersionInfo;
  setup: SystemSetupStatus;
  metrics: SystemMetrics;
  domainSummaries: SupportDomainSummary[];
  recentActivity: import('./activity').ActivityLog[];
  recentFailures: import('./activity').ActivityLog[];
  logs: SupportLogLine[];
  findings: SupportFinding[];
  redactionRules: SupportRedactionRule[];
  commands: SupportCommand[];
  bundleText: string;
  recentFailureCount: number;
  generatedAt: string;
};
