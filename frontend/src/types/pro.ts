export type ProEntitlementState =
  | 'NOT_ACTIVATED'
  | 'ACTIVATING'
  | 'ACTIVE'
  | 'ONLINE_GRACE'
  | 'RETAINED_USE'
  | 'SUSPENDED_ONLINE'
  | 'REVOKED'
  | 'INVALID'
  | 'ERROR';

export type ProModuleState =
  | 'NOT_INSTALLED'
  | 'RELEASE_AVAILABLE'
  | 'DOWNLOADING'
  | 'VERIFYING'
  | 'STARTING_CANDIDATE'
  | 'HEALTH_CHECKING'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'ROLLING_BACK'
  | 'RETAINED_USE'
  | 'UPDATE_INELIGIBLE'
  | 'REMOVING'
  | 'ERROR';

export interface ProModuleStatus {
  state: ProModuleState;
  componentVersion: string | null;
  activeDigest: string | null;
  previousDigest: string | null;
  health: 'not-checked' | 'healthy' | 'degraded' | 'failed';
  jobId: string | null;
  errorCode: string | null;
}

export interface ProEntitlementStatus {
  schemaVersion: '1';
  state: ProEntitlementState;
  plan: string | null;
  features: string[];
  updatesThrough: string | null;
  serviceLeaseExpiresAt: string | null;
  lastVerifiedServerTime: string | null;
  localUseAllowed: boolean;
  updatesAllowed: boolean;
  hostedServicesAllowed: boolean;
  grantFingerprint: string | null;
  reasonCode: string;
}
