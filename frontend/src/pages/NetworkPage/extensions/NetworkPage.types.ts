import type { LucideIcon } from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { AppRuntimeView } from '@/types/app';
import type { PrivateAccessReconciliationItem } from '@/types/network';

export type NetworkNodeKind = 'internet' | 'project-os' | 'router' | 'apps' | 'private-apps' | 'devices' | 'lan' | 'public-apps' | 'network-apps' | 'local-apps';
export type NetworkNodeStatus = 'connected' | 'warning' | 'neutral';

export type NetworkNodeData = {
  appDetails?: NetworkNodeAppDetail[];
  count?: number;
  detail: string;
  deviceDetails?: NetworkNodeDeviceDetail[];
  insight: string;
  items?: string[];
  kind: NetworkNodeKind;
  label: string;
  status: NetworkNodeStatus;
};

export type NetworkFlowNode = Node<NetworkNodeData, 'networkNode'>;

export type NetworkNodeAppDetail = {
  appId: string;
  appName: string;
  exposureLabel: string;
  expectedLocalPort: number | null;
  observedLocalPort: number | null;
  privateMapping: string | null;
  privateStatus: string | null;
  lastCheckedAt: string | null;
  lastVerifiedAt: string | null;
  repairNeeded: boolean;
};

export type NetworkNodeDeviceDetail = {
  connectionType: string;
  dnsName: string;
  ipAddress: string;
  label: string;
  lastSeen: string;
  status: NetworkNodeStatus;
  statusLabel: string;
};

export type NetworkAction = {
  label: string;
  detail: string;
  tone: NetworkNodeStatus;
};

export type NetworkPosture = {
  status: 'ready' | 'setup-needed' | 'attention';
  headline: string;
  summary: string;
  primaryAction: NetworkAction | null;
  counts: {
    privateApps: number;
    onlineDevices: number;
    issues: number;
  };
};

export type NetworkIssueView = {
  id: string;
  label: string;
  message: string;
  detail: string;
  actionLabel: string | null;
  source: 'network' | 'app';
  status: NetworkNodeStatus;
};

export type PrivateAppAccess = {
  app: AppRuntimeView;
  localUrl: string | null;
  privateUrl: string | null;
  reconciliation: PrivateAccessReconciliationItem | null;
  status: NetworkNodeStatus;
  statusLabel: string;
};

export type NetworkDeviceView = {
  connectionType: string;
  detail: string;
  dnsName: string;
  icon: LucideIcon;
  ipAddress: string;
  lastSeen: string;
  label: string;
  operatingSystem: string;
  status: NetworkNodeStatus;
  statusLabel: string;
};

export type AppExposureLevel = 'public' | 'tailnet' | 'lan' | 'local';

export type AppExposureGroup = {
  apps: AppRuntimeView[];
  detail: string;
  level: AppExposureLevel;
  label: string;
  status: NetworkNodeStatus;
};
