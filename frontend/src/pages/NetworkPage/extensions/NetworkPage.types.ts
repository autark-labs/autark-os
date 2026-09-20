import type { LucideIcon } from 'lucide-react';
import type { AppRuntimeView } from '@/types/app';

export type NetworkNodeStatus = 'connected' | 'warning' | 'neutral';

export type NetworkIssueView = {
  id: string;
  label: string;
  message: string;
  detail: string;
  actionLabel: string | null;
  source: 'network' | 'app';
  status: NetworkNodeStatus;
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

export type ReachabilityZoneId = 'local' | 'lan' | 'tailnet' | 'public';

export type ReachabilityTypeFilter = 'managed' | 'attention';

export type ReachabilityService = {
  id: string;
  type: 'managed-app';
  app: AppRuntimeView | null;
  label: string;
  detail: string;
  zone: ReachabilityZoneId;
  openUrl: string | null;
  status: NetworkNodeStatus;
  statusLabel: string;
  draggable: boolean;
  issue: string | null;
  privateUrl: string | null;
  localUrl: string | null;
  iconUrl: string | null;
};
