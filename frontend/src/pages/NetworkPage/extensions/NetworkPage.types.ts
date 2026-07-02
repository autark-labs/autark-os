import type { LucideIcon } from 'lucide-react';
import type { AppRuntimeView } from '@/types/app';
import type { PrivateAccessReconciliationItem } from '@/types/network';

export type NetworkNodeStatus = 'connected' | 'warning' | 'neutral';

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
