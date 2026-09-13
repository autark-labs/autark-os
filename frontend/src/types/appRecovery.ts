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
  planId: string;
  ownershipTransferRequired: boolean;
  runtimePath: string;
  sourceComposeProject: string;
  targetComposeProject: string;
  appInstanceId: string;
  containers: string[];
  mounts: string[];
  ports: string[];
  checks: AppRecoveryCheck[];
  steps: string[];
  blockedReasons: string[];
};
