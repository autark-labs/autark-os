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
  reason: 'current_instance_registration_lost' | string;
  applicable: boolean;
  summary: string;
  planId: string;
  runtimePath: string;
  composeProject: string;
  appInstanceId: string;
  containers: string[];
  mounts: string[];
  ports: string[];
  checks: AppRecoveryCheck[];
  steps: string[];
  blockedReasons: string[];
};
