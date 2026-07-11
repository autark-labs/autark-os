export type RestorePoint = {
  id: number;
  appId: string;
  appName: string;
  scope: 'full' | 'app' | string;
  source: 'automatic' | 'manual' | 'pre_restore' | string;
  includedAppIds: string;
  status: 'completed' | 'failed' | string;
  path: string;
  sizeBytes: number;
  message: string;
  verificationStatus: 'verified' | 'warning' | 'failed' | 'not_checked' | string;
  verificationMessage: string;
  checksumSha256: string;
  restoreConfidence: 'high' | 'medium' | 'low' | 'unknown' | string;
  verifiedAt: string | null;
  createdAt: string;
};

export type BackupVerificationResult = {
  restorePointId: number;
  status: 'verified' | 'warning' | 'failed' | 'not_checked' | string;
  message: string;
  checksumSha256: string;
  restoreConfidence: 'high' | 'medium' | 'low' | 'unknown' | string;
  verifiedAt: string | null;
};

export type AppBackupStatus = {
  appId: string;
  appName: string;
  status: 'protected' | 'unprotected' | 'not_backed_up' | 'failed' | 'needs_backup_review' | string;
  protectedByBackups: boolean;
  backupFrequency: string;
  backupRetention: number;
  backupContract: BackupContract;
  runtimePath: string;
  dataSizeBytes: number;
  latestBackup: RestorePoint | null;
  restorePoints: RestorePoint[];
  message: string;
  nextBackup: string;
  checkedAt: string;
};

export type BackupSettingsSummary = {
  automaticBackupsEnabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | string;
  retentionDays: number;
  backupTime: string;
  timeZone: string;
  nextRunLabel: string;
  schedulerHealth: 'off' | 'manual_only' | 'warning' | 'healthy' | string;
  schedulerMessage: string;
  lastRoutineRun: RestorePoint | null;
  lastSuccessfulRoutineRun: RestorePoint | null;
  lastSuccessfulVerification: RestorePoint | null;
  nextRoutineRun: string;
};

export type BackupContract = {
  strategy: 'file-only' | 'sqlite' | 'postgres' | 'app-export' | 'multi-service' | 'none' | 'unknown' | string;
  label: string;
  confidence: 'standard' | 'needs_review' | 'weak' | string;
  reviewRequired: boolean;
  summary: string;
  details: string[];
};

export type BackupReport = {
  status: 'protected' | 'attention' | 'warning' | string;
  headline: string;
  summary: string;
  settings: BackupSettingsSummary;
  totalApps: number;
  protectedApps: number;
  unprotectedApps: number;
  failedBackups: number;
  backupStorageBytes: number;
  backupRoot: string;
  apps: AppBackupStatus[];
  recentRestorePoints: RestorePoint[];
  checkedAt: string;
};

export type BackupRunResult = {
  appId: string;
  appName: string;
  status: 'completed' | 'failed' | string;
  message: string;
  restorePoint: RestorePoint | null;
  completedAt: string;
};

export type RestorePlan = {
  restorePointId: number;
  scope: 'full' | 'app' | string;
  source: string;
  targetAppId: string | null;
  title: string;
  summary: string;
  affectedApps: string[];
  warnings: string[];
  steps: string[];
  dryRunDetails: string[];
  verificationStatus: string;
  verificationMessage: string;
  simulation: RestoreSimulationResult;
  restoreConfidence: string;
  executable: boolean;
  plannedAt: string;
};

export type RestoreSimulationResult = {
  status: 'passed' | 'warning' | 'failed' | string;
  message: string;
  details: string[];
  simulatedAt: string;
};

export type RestoreResult = {
  restorePointId: number;
  status: 'completed' | 'failed' | string;
  message: string;
  restoredAppIds: string[];
  logs: string[];
  completedAt: string;
};
