export type TailscaleStatus = {
  installed: boolean;
  connected: boolean;
  state: string;
  message: string;
  deviceName: string | null;
  dnsName: string | null;
  tailnetIps: string[];
  tailnetName: string | null;
  loginName: string | null;
};

export type TailscaleConnectGuide = {
  headline: string;
  summary: string;
  steps: string[];
  installUrl: string;
  connectCommand: string;
  advancedNote: string;
};

export type TailscaleDevice = {
  id: string;
  name: string;
  dnsName: string;
  tailnetIps: string[];
  operatingSystem: string;
  online: boolean;
  lastSeen: string;
  connectionType: 'direct' | 'relay' | 'offline' | 'unknown' | string;
  relay: string;
  currentAddress: string;
  exitNode: boolean;
  self: boolean;
  user: string;
};

export type DeviceTrustMetadata = {
  deviceId: string;
  nickname: string;
  trustGroup: string;
  trusted: boolean;
  notes: string;
  updatedAt: string;
};

export type DeviceTrustUpdateRequest = {
  nickname: string;
  trustGroup: string;
  trusted: boolean;
  notes: string;
};

export type DeviceReachability = {
  status: 'verified_from_project_os' | 'partial' | 'needs_attention' | 'not_expected' | 'no_private_apps' | 'offline' | 'needs_setup' | string;
  label: string;
  detail: string;
  online: boolean;
  trusted: boolean;
  verifiedFromProjectOs: boolean;
  reachablePrivateApps: number;
  expectedPrivateApps: number;
  checkedAt: string;
};

export type TrustedDeviceView = {
  device: TailscaleDevice;
  metadata: DeviceTrustMetadata;
  reachability: DeviceReachability;
};

export type DeviceAccessReport = {
  status: 'ready' | 'needs_setup' | string;
  headline: string;
  summary: string;
  tailscale: TailscaleStatus;
  privateAccess: PrivateAccessReconciliationReport;
  devices: TrustedDeviceView[];
  onboardingSteps: string[];
  checkedAt: string;
};

export type NetworkDiagnosticStatus = 'healthy' | 'warning' | 'neutral' | string;

export type NetworkDiagnosticItem = {
  id: string;
  label: string;
  status: NetworkDiagnosticStatus;
  message: string;
  detail: string;
  actionLabel: string | null;
};

export type NetworkDiagnosticsReport = {
  status: NetworkDiagnosticStatus;
  headline: string;
  summary: string;
  checks: NetworkDiagnosticItem[];
  appChecks: NetworkDiagnosticItem[];
  checkedAt: string;
};

export type PrivateAccessReconciliationStatus = 'healthy' | 'missing' | 'mismatched' | 'waiting' | 'unknown' | string;

export type PrivateAccessReconciliationItem = {
  appId: string;
  appName: string;
  status: PrivateAccessReconciliationStatus;
  message: string;
  detail: string;
  actionLabel: string | null;
  expectedPrivateUrl: string | null;
  actualPrivateUrl: string | null;
  expectedPort: number | null;
  actualPort: number | null;
  target: string | null;
  expectedLocalPort: number | null;
  expectedHttpsPort: number | null;
  storedPrivateUrl: string | null;
  desiredMapping: string | null;
  liveMappings: string[];
  matchReason: string | null;
  verifiedAt: string | null;
};

export type PrivateAccessStaleMapping = {
  id: string;
  serviceName: string | null;
  endpoint: string | null;
  servePort: number | null;
  target: string | null;
  targetPort: number | null;
  message: string;
  detail: string;
  actionLabel: string | null;
};

export type PrivateAccessReconciliationReport = {
  status: NetworkDiagnosticStatus;
  headline: string;
  summary: string;
  apps: PrivateAccessReconciliationItem[];
  staleMappings: PrivateAccessStaleMapping[];
  checkedAt: string;
};

export type TailscaleServeResult = {
  configured: boolean;
  privateUrl: string | null;
  message: string;
  output: string[];
};

export type SystemSetupCheck = {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'neutral' | string;
  message: string;
  detail: string;
  actionLabel: string | null;
  actionCommand: string | null;
};

export type SystemSetupStatus = {
  status: 'ready' | 'ready_with_notes' | 'needs_admin_setup' | string;
  headline: string;
  summary: string;
  runAsUser: string;
  expectedUser: string;
  installCommand: string;
  checks: SystemSetupCheck[];
  checkedAt: string;
};
