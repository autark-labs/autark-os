export type OwnershipState = 'owned_managed' | 'foreign_project_os' | 'legacy_project_os' | 'external_docker' | 'unknown_conflict' | string;

export type ManagementMode = 'managed' | 'observed' | 'linked' | 'recoverable' | 'conflict' | string;

export type HostInventoryResource = {
  id: string;
  displayName: string;
  catalogAppId: string;
  ownershipState: OwnershipState;
  managementMode: ManagementMode;
  ownerInstanceId: string;
  currentInstanceId: string;
  runtimeState: string;
  accessUrls: string[];
  source: string;
  availableActions: string[];
  ignored: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'info' | string;
  summary: string;
  details: Record<string, string>;
};

export type HostInventoryActionResult = {
  ok: boolean;
  severity: 'success' | 'info' | 'warning' | 'error' | string;
  title: string;
  message: string;
  resourceId: string;
  nextAction: string;
};
