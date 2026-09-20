import { MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { catalogAppImageUrl, preferredAppImageUrl } from '@/lib/appImage';
import type { AppRuntimeView } from '@/types/app';
import type { NetworkDiagnosticsReport, PrivateAccessReconciliationItem, PrivateAccessReconciliationReport, TailscaleDevice, TailscaleStatus } from '@/types/network';
import type { NetworkDeviceView, NetworkIssueView, NetworkNodeStatus, ReachabilityService, ReachabilityZoneId } from './NetworkPage.types';
import { privateAccessUrlForApp } from './NetworkPage.privateAccess';

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

export function buildReachabilityServices({
  apps,
  reconciliation,
  tailscale,
}: {
  apps: AppRuntimeView[];
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

  return managed.sort((left, right) => left.label.localeCompare(right.label));
}

function managedAppIconUrl(app: AppRuntimeView) {
  return preferredAppImageUrl(app.image, catalogAppImageUrl(app.appId));
}

function reachabilityIssue(app: AppRuntimeView, reconciliationItem: PrivateAccessReconciliationItem | null) {
  if (app.state === 'degraded' || app.state === 'missing' || app.state === 'unknown') {
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

function classifyAppExposure(app: AppRuntimeView, tailscale: TailscaleStatus | null): ReachabilityZoneId {
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
    if (app.accessRoute?.dashboardScope) return app.accessRoute.dashboardScope === 'network' ? 'lan' : 'local';
    return 'lan';
  }
  if (desiredMode === 'local' || desiredMode === 'none') {
    if (app.accessRoute?.dashboardScope) return app.accessRoute.dashboardScope === 'network' ? 'lan' : 'local';
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
