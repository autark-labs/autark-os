import type { ApplicationState } from './applicationState';

export type AppRecoveryCheck = {
  id: string;
  label: string;
  status: 'passed' | 'blocked' | 'warning' | string;
  message: string;
  detail: string;
};

export type AppRecoveryPlan = {
  appId: string;
  appName: string;
  reason: 'current_instance_registration_lost' | 'previous_instance' | 'legacy_autark' | 'insufficient_evidence' | string;
  applicable: boolean;
  summary: string;
  runtimePath: string;
  composeProject: string;
  appInstanceId: string;
  containers: string[];
  mounts: string[];
  ports: string[];
  checks: AppRecoveryCheck[];
  steps: string[];
  blockedReasons: string[];
  confirmationText: string;
};

export type AppRecoveryResult = {
  ok: boolean;
  severity: 'success' | 'info' | 'warning' | 'error' | string;
  title: string;
  message?: string | null;
  resourceId?: string | null;
  nextAction?: string | null;
  applicationState?: ApplicationState | null;
};
