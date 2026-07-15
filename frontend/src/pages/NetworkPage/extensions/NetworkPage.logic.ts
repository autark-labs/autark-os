import { MonitorSmartphone, ShieldCheck } from 'lucide-react';
import type { AppRuntimeView } from '@/types/app';
import type { ObservedServiceView } from '@/types/observedService';
import type { NetworkDiagnosticsReport, PrivateAccessReconciliationItem, PrivateAccessReconciliationReport, TailscaleDevice, TailscaleStatus } from '@/types/network';
import type { AppExposureGroup, AppExposureLevel, NetworkDeviceView, NetworkIssueView, NetworkNodeStatus, NetworkPosture, PrivateAppAccess, ReachabilityService, ReachabilityZoneId } from './NetworkPage.types';
import { privateAccessUrlForApp } from './NetworkPage.privateAccess';

export function buildNetworkPosture({
  devices,
  diagnostics,
  privateApps,
  reconciliation,
  tailscale,
}: {
  devices: NetworkDeviceView[];
  diagnostics: NetworkDiagnosticsReport | null;
  privateApps: AppRuntimeView[];
  reconciliation?: PrivateAccessReconciliationReport | null;
  tailscale: TailscaleStatus | null;
}): NetworkPosture {
  const connected = Boolean(tailscale?.connected);
  const installed = Boolean(tailscale?.installed);
  const onlineDevices = devices.filter((device) => device.status === 'connected').length;
  const issues = buildNetworkIssues(diagnostics, reconciliation).length;

  if (!installed) {
    return {
      status: 'setup-needed',
      headline: 'Set up private access',
      summary: 'Install Tailscale on this device so Autark-OS can create private links for your apps.',
      primaryAction: {
        detail: 'This is the first step before phones, laptops, or private app links can appear here.',
        label: 'Install Tailscale',
        tone: 'warning',
      },
      counts: { privateApps: privateApps.length, onlineDevices, issues },
    };
  }

  if (!connected) {
    return {
      status: 'setup-needed',
      headline: 'Connect Autark-OS to your private network',
      summary: tailscale?.message || 'Sign in to Tailscale from this device to enable private app links.',
      primaryAction: {
        detail: 'Once connected, Autark-OS can show your devices and prepare private app links.',
        label: 'Connect this device',
        tone: 'warning',
      },
      counts: { privateApps: privateApps.length, onlineDevices, issues },
    };
  }

  if (issues > 0) {
    return {
      status: 'attention',
      headline: 'Private access is on, with items to review',
      summary: `${issues} network ${issues === 1 ? 'check needs' : 'checks need'} attention. Your private network is connected, but a link or setting may need a look.`,
      primaryAction: {
        detail: 'Start with the issue list below. Most fixes are safe to retry from this page.',
        label: 'Review issues',
        tone: 'warning',
      },
      counts: { privateApps: privateApps.length, onlineDevices, issues },
    };
  }

  if (privateApps.length === 0) {
    return {
      status: 'ready',
      headline: 'Private access is ready',
      summary: 'Autark-OS is connected. Choose which apps should be available from your private devices.',
      primaryAction: {
        detail: 'Turn on private access for apps you use away from home.',
        label: 'Make apps private',
        tone: 'connected',
      },
      counts: { privateApps: privateApps.length, onlineDevices, issues },
    };
  }

  return {
    status: 'ready',
    headline: 'Your private network is ready',
    summary: `${privateApps.length} ${privateApps.length === 1 ? 'app is' : 'apps are'} available privately and ${onlineDevices} ${onlineDevices === 1 ? 'device is' : 'devices are'} online.`,
    primaryAction: {
      detail: 'Use the map and private app links below to confirm access.',
      label: 'Everything looks good',
      tone: 'connected',
    },
    counts: { privateApps: privateApps.length, onlineDevices, issues },
  };
}

export function buildNetworkIssues(diagnostics: NetworkDiagnosticsReport | null, reconciliation?: PrivateAccessReconciliationReport | null): NetworkIssueView[] {
  const diagnosticIssues = diagnostics
    ? [...diagnostics.checks.map((item) => ({ item, source: 'network' as const })), ...diagnostics.appChecks.map((item) => ({ item, source: 'app' as const }))]
    .filter(({ item }) => item.status === 'warning')
    .map(({ item, source }) => ({
      actionLabel: item.actionLabel,
      detail: item.detail,
      id: item.id,
      label: item.label,
      message: item.message,
      source,
      status: 'warning' as const,
    }))
    : [];
  const staleIssues = (reconciliation?.staleMappings || []).map((mapping) => ({
    actionLabel: mapping.actionLabel,
    detail: mapping.detail,
    id: `stale-${mapping.id}`,
    label: `Stale link on port ${mapping.servePort ?? 'unknown'}`,
    message: mapping.message,
    source: 'network' as const,
    status: 'warning' as const,
  }));
  const privateLinkIssues = (reconciliation?.apps || [])
    .filter((app) => !['healthy', 'waiting'].includes(app.status))
    .map((app) => ({
      actionLabel: app.actionLabel,
      detail: app.detail,
      id: `private-link-${app.appId}`,
      label: `${app.appName} private link`,
      message: app.message,
      source: 'app' as const,
      status: 'warning' as const,
    }));
  return [...diagnosticIssues, ...privateLinkIssues, ...staleIssues];
}

export function buildPrivateAppAccess(privateApps: AppRuntimeView[], tailscale: TailscaleStatus | null, reconciliation: PrivateAccessReconciliationReport | null): PrivateAppAccess[] {
  const reconciliationByAppId = new Map((reconciliation?.apps || []).map((item) => [item.appId, item]));
  return privateApps.map((app) => {
    const reconciliationItem = reconciliationByAppId.get(app.appId) || null;
    const privateUrl = privateAccessUrlForApp(app, reconciliationItem);
    const portConflict = app.accessRoute?.privateLinkStatus === 'port_conflict';
    const healthy = reconciliationItem?.status === 'healthy';
    const needsRepair = reconciliationItem != null && !['healthy', 'waiting'].includes(reconciliationItem.status);
    const configured = !portConflict && (healthy || app.observedAccess?.privateLinkStatus === 'verified') && Boolean(privateUrl);
    const missing = portConflict || needsRepair || app.observedAccess?.privateLinkStatus === 'missing';
    return {
      app,
      localUrl: app.observedAccess?.localUrl || app.accessUrl || app.settings?.accessUrl || null,
      privateUrl,
      reconciliation: reconciliationItem,
      status: configured && !missing ? 'connected' : 'warning',
      statusLabel: healthy ? `Verified by Tailscale${reconciliationItem.verifiedAt ? ` ${formatVerifiedAt(reconciliationItem.verifiedAt)}` : ''}` : configured && !missing ? 'Available privately' : reconciliationItem?.message || 'Needs repair',
    };
  });
}

export function buildReachabilityServices({
  apps,
  pinnedExternalServices = [],
  reconciliation,
  tailscale,
}: {
  apps: AppRuntimeView[];
  pinnedExternalServices?: ObservedServiceView[];
  reconciliation: PrivateAccessReconciliationReport | null;
  tailscale: TailscaleStatus | null;
}): ReachabilityService[] {
  const reconciliationByAppId = new Map((reconciliation?.apps || []).map((item) => [item.appId, item]));
  const managed = apps.map((app) => {
    const reconciliationItem = reconciliationByAppId.get(app.appId) || null;
    const privateUrl = privateAccessUrlForApp(app, reconciliationItem);
    const localUrl = app.observedAccess?.localUrl || app.accessRoute?.localUrl || app.accessUrl || app.settings?.accessUrl || null;
    const zone = classifyAppExposure(app, tailscale);
    const issue = reachabilityIssue(app, reconciliationItem);
    const status: NetworkNodeStatus = issue ? 'warning' : zone === 'tailnet' ? 'connected' : 'neutral';
    return {
      app,
      detail: reachabilityDetail(zone, app),
      draggable: true,
      iconUrl: managedAppIconUrl(app),
      id: app.appId,
      issue,
      label: app.appName,
      localUrl,
      openUrl: privateUrl || localUrl,
      privateUrl,
      status,
      statusLabel: issue ? 'Needs attention' : reachabilityStatusLabel(zone),
      type: 'managed-app' as const,
      zone,
    };
  });

  const external = pinnedExternalServices.map((service) => ({
    app: null,
    detail: service.url || 'Pinned external service',
    draggable: false,
    iconUrl: observedServiceIconUrl(service),
    id: service.id,
    issue: null,
    label: service.displayName,
    localUrl: service.url || null,
    openUrl: service.url || null,
    privateUrl: null,
    status: 'neutral' as const,
    statusLabel: service.userStatus === 'pinned_external' || service.pinned ? 'Pinned external' : service.userStatusLabel,
    type: 'external-service' as const,
    zone: 'lan' as const,
  }));

  return [...managed, ...external].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'managed-app' ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

function managedAppIconUrl(app: AppRuntimeView) {
  return nonBlank(app.image);
}

function observedServiceIconUrl(service: ObservedServiceView) {
  return nonBlank(service.metadata?.iconUrl)
    || nonBlank(service.metadata?.icon)
    || nonBlank(service.metadata?.appIcon)
    || nonBlank(service.metadata?.imageUrl)
    || nonBlank(service.metadata?.catalogImage)
    || catalogIconUrl(service.catalogAppId);
}

function catalogIconUrl(catalogAppId: string | null | undefined) {
  const appId = nonBlank(catalogAppId);
  if (!appId || !/^[a-z0-9][a-z0-9-]*$/.test(appId)) {
    return null;
  }
  return `/app-images/${appId}.svg`;
}

function nonBlank(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function reachabilityIssue(app: AppRuntimeView, reconciliationItem: PrivateAccessReconciliationItem | null) {
  if (app.attentionState && app.attentionState !== 'none') {
    return app.remediation?.summary || app.healthSnapshot?.message || 'This app needs review.';
  }
  if (reconciliationItem && !['healthy', 'waiting'].includes(reconciliationItem.status)) {
    return reconciliationItem.message || 'Private link needs review.';
  }
  if (app.accessRoute?.privateLinkStatus === 'port_conflict') {
    return 'Private link has a port conflict.';
  }
  return null;
}

function reachabilityDetail(zone: ReachabilityZoneId, app: AppRuntimeView) {
  if (zone === 'tailnet') {
    return 'Available to trusted Tailscale devices.';
  }
  if (zone === 'lan') {
    return 'Available from this home network.';
  }
  if (zone === 'public') {
    return 'Review public exposure carefully.';
  }
  return app.accessRoute?.localUrl || app.observedAccess?.localUrl || app.accessUrl
    ? 'Available from this server.'
    : 'No open link configured yet.';
}

function reachabilityStatusLabel(zone: ReachabilityZoneId) {
  if (zone === 'tailnet') {
    return 'Private';
  }
  if (zone === 'lan') {
    return 'Home';
  }
  if (zone === 'public') {
    return 'Public';
  }
  return 'Server';
}

export function buildAppExposureGroups(apps: AppRuntimeView[], tailscale: TailscaleStatus | null, reconciliation?: PrivateAccessReconciliationReport | null): Record<AppExposureLevel, AppExposureGroup> {
  const groups: Record<AppExposureLevel, AppRuntimeView[]> = {
    lan: [],
    local: [],
    public: [],
    tailnet: [],
  };
  const reconciliationByAppId = new Map((reconciliation?.apps || []).map((item) => [item.appId, item]));

  apps.forEach((app) => {
    groups[classifyAppExposure(app, tailscale)].push(app);
  });

  return {
    public: {
      apps: groups.public,
      detail: groups.public.length > 0 ? `${groups.public.length} app${groups.public.length === 1 ? '' : 's'} reachable beyond your home` : 'No apps exposed to the wider internet',
      label: 'Wider internet',
      level: 'public',
      status: groups.public.length > 0 ? 'warning' : 'neutral',
    },
    tailnet: {
      apps: groups.tailnet,
      detail: groups.tailnet.length > 0 ? `${groups.tailnet.length} app${groups.tailnet.length === 1 ? '' : 's'} available to trusted Tailscale devices` : 'No apps available over Tailscale',
      label: 'Tailnet private apps',
      level: 'tailnet',
      status: groupHasPrivateLinkIssue(groups.tailnet, reconciliationByAppId) ? 'warning' : groups.tailnet.length > 0 ? 'connected' : 'neutral',
    },
    lan: {
      apps: groups.lan,
      detail: groups.lan.length > 0 ? `${groups.lan.length} app${groups.lan.length === 1 ? '' : 's'} available on your home network` : 'No apps shared on the home network',
      label: 'Home network apps',
      level: 'lan',
      status: groups.lan.length > 0 ? 'connected' : 'neutral',
    },
    local: {
      apps: groups.local,
      detail: groups.local.length > 0 ? `${groups.local.length} app${groups.local.length === 1 ? '' : 's'} stay on this device` : 'No localhost-only apps',
      label: 'This device only',
      level: 'local',
      status: groups.local.length > 0 ? 'connected' : 'neutral',
    },
  };
}

export function buildDeviceViews(tailscale: TailscaleStatus | null, tailnetDevices: TailscaleDevice[]): NetworkDeviceView[] {
  const connected = Boolean(tailscale?.connected);
  if (!connected || tailnetDevices.length === 0) {
    return [{
      connectionType: 'waiting',
      detail: connected ? 'Connected, waiting for peer details' : 'Connect Tailscale, then add your phone or laptop',
      dnsName: tailscale?.dnsName || '',
      icon: connected ? ShieldCheck : MonitorSmartphone,
      ipAddress: tailscale?.tailnetIps?.[0] || '',
      lastSeen: '',
      label: tailscale?.deviceName || 'Autark-OS',
      operatingSystem: '',
      status: connected ? 'neutral' : 'warning',
      statusLabel: connected ? 'Syncing' : 'Waiting',
    }];
  }
  return tailnetDevices.map((device) => {
    const status: NetworkNodeStatus = device.online ? 'connected' : 'neutral';
    return {
      connectionType: friendlyConnectionType(device),
      detail: device.self ? 'This Autark-OS device' : formatLastSeen(device.lastSeen, device.online),
      dnsName: device.dnsName,
      icon: device.self ? ShieldCheck : MonitorSmartphone,
      ipAddress: device.tailnetIps[0] || '',
      lastSeen: device.lastSeen,
      label: device.name || device.dnsName || 'Tailnet device',
      operatingSystem: friendlyOs(device.operatingSystem),
      status,
      statusLabel: device.online ? 'Online' : 'Offline',
    };
  });
}

function classifyAppExposure(app: AppRuntimeView, tailscale: TailscaleStatus | null): AppExposureLevel {
  const desiredMode = app.settings?.desiredAccessMode || app.desiredAccess?.mode;
  if (desiredMode === 'public') {
    return 'public';
  }
  if (desiredMode === 'private' || desiredMode === 'local-and-private' || app.settings?.tailscaleEnabled) {
    const routeVerified = app.accessRoute?.privateLinkStatus === 'verified' && Boolean(app.accessRoute.privateUrl);
    const observedVerified = app.observedAccess?.privateLinkStatus === 'verified' && Boolean(app.observedAccess.privateUrl);
    if (routeVerified || observedVerified) {
      return 'tailnet';
    }
  }
  if (desiredMode === 'network') {
    return 'lan';
  }
  if (desiredMode === 'local' || desiredMode === 'none') {
    return 'local';
  }

  const accessUrl = app.accessUrl || app.settings?.accessUrl;
  if (!accessUrl) {
    return 'local';
  }

  try {
    const hostname = new URL(accessUrl).hostname.toLowerCase();
    const tailscaleHost = tailscale?.dnsName?.replace(/\.$/, '').toLowerCase();
    if (tailscaleHost && hostname === tailscaleHost) {
      return 'tailnet';
    }
    if (isLocalhost(hostname)) {
      return 'local';
    }
    if (isPrivateNetworkHost(hostname)) {
      return hostname.endsWith('.ts.net') ? 'tailnet' : 'lan';
    }
    return 'public';
  } catch {
    return 'local';
  }
}

function groupHasPrivateLinkIssue(apps: AppRuntimeView[], reconciliationByAppId: Map<string, PrivateAccessReconciliationItem>) {
  return apps.some((app) => {
    const item = reconciliationByAppId.get(app.appId);
    return item != null && !['healthy', 'waiting'].includes(item.status);
  });
}

function isLocalhost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0';
}

function isPrivateNetworkHost(hostname: string) {
  if (hostname.endsWith('.local') || hostname.endsWith('.ts.net')) {
    return true;
  }
  if (/^[a-z0-9-]+$/i.test(hostname)) {
    return true;
  }
  if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
    return true;
  }
  const match = hostname.match(/^172\.(\d{1,2})\./);
  if (match) {
    const secondOctet = Number(match[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }
  return false;
}

function friendlyConnectionType(device: TailscaleDevice) {
  if (!device.online) return 'offline';
  if (device.connectionType === 'direct') return 'direct';
  if (device.connectionType === 'relay') return device.relay ? `relay ${device.relay}` : 'relay';
  return 'online';
}

function friendlyOs(os: string) {
  const value = os.toLowerCase();
  if (value === 'macos') return 'macOS';
  if (value === 'ios') return 'iOS';
  if (value === 'android') return 'Android';
  if (value === 'windows') return 'Windows';
  if (value === 'linux') return 'Linux';
  return os;
}

function formatLastSeen(lastSeen: string, online: boolean) {
  if (online) return 'Available right now';
  if (!lastSeen) return 'Offline';
  const timestamp = Date.parse(lastSeen);
  if (Number.isNaN(timestamp)) return `Last seen ${lastSeen}`;
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Last seen ${hours} hr ago`;
  return `Last seen ${Math.round(hours / 24)} days ago`;
}

function formatVerifiedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
