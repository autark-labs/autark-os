export type ProMode = 'free' | 'accountless' | 'account' | string;

export type ProEntitlementStatus = 'none' | 'active' | 'expired' | 'revoked' | string;

export type ProStatus = {
  enabled: boolean;
  mode: ProMode;
  registered: boolean;
  installId: string | null;
  accountLinked: boolean;
  accountEmail: string | null;
  plan: string | null;
  entitlementStatus: ProEntitlementStatus;
  entitlementExpiresAt: string | null;
  healthReportingEnabled: boolean;
  alertsEnabled: boolean;
  proFeedEnabled: boolean;
  configSnapshotEnabled: boolean;
  lastHeartbeatAt: string | null;
  lastHeartbeatResult: string | null;
  lastEntitlementCheckAt: string | null;
  lastFeedSyncAt: string | null;
  remoteApiConfigured: boolean;
  remoteApiHealthy: boolean | null;
};

export type ProPrivacyPayloadPreview = {
  generatedAt: string;
  payload: Record<string, unknown>;
  maySend: string[];
  neverSends: string[];
};
