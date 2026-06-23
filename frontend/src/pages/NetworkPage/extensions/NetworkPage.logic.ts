import { MonitorSmartphone, ShieldCheck } from 'lucide-react';
import type { AppRuntimeView } from '@/types/app';
import type { NetworkDiagnosticsReport, PrivateAccessReconciliationItem, PrivateAccessReconciliationReport, TailscaleDevice, TailscaleStatus } from '@/types/network';
import type { AppExposureGroup, AppExposureLevel, NetworkDeviceView, NetworkIssueView, NetworkNodeAppDetail, NetworkNodeData, NetworkNodeStatus, NetworkPosture, PrivateAppAccess } from './NetworkPage.types';
import { privateAccessUrlForApp } from './NetworkPage.privateAccess.js';

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
      summary: 'Install Tailscale on this device so Project OS can create private links for your apps.',
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
      headline: 'Connect Project OS to your private network',
      summary: tailscale?.message || 'Sign in to Tailscale from this device to enable private app links.',
      primaryAction: {
        detail: 'Once connected, Project OS can show your devices and prepare private app links.',
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
      summary: 'Project OS is connected. Choose which apps should be available from your private devices.',
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
    const configured = !portConflict && (healthy || app.observedAccess?.privateLinkStatus === 'configured' || Boolean(privateUrl));
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
      label: tailscale?.deviceName || 'Project OS',
      operatingSystem: '',
      status: connected ? 'neutral' : 'warning',
      statusLabel: connected ? 'Syncing' : 'Waiting',
    }];
  }
  return tailnetDevices.map((device) => {
    const status: NetworkNodeStatus = device.online ? 'connected' : 'neutral';
    return {
      connectionType: friendlyConnectionType(device),
      detail: device.self ? 'This Project OS device' : formatLastSeen(device.lastSeen, device.online),
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

export function getNodeDetails(
  nodeId: string,
  context: {
    apps: AppRuntimeView[];
    exposureGroups?: Record<AppExposureLevel, AppExposureGroup>;
    devices: NetworkDeviceView[];
    privateAppAccess: PrivateAppAccess[];
    reconciliation?: PrivateAccessReconciliationReport | null;
    runningApps: AppRuntimeView[];
    tailscale: TailscaleStatus | null;
  },
): NetworkNodeData {
  const connected = Boolean(context.tailscale?.connected);
  const details: Record<string, NetworkNodeData> = {
    internet: {
      detail: 'Public web access',
      insight: 'Project OS should favor private links first. Public exposure can be added later as an intentional advanced action.',
      kind: 'internet',
      label: 'Internet',
      status: 'neutral',
    },
    'project-os': {
      detail: connected ? context.tailscale?.dnsName || context.tailscale?.deviceName || 'Connected' : 'Connect this device first',
      insight: connected ? 'This device is ready to coordinate private access for your installed apps.' : 'Start here: connect Project OS to Tailscale so it can create private app paths.',
      kind: 'project-os',
      label: 'Project OS',
      status: connected ? 'connected' : 'warning',
    },
    router: {
      detail: 'Your home network',
      insight: 'Local access stays available at home. Private access adds a safer path for phones and laptops when you are away.',
      kind: 'router',
      label: 'Home Network',
      status: 'connected',
    },
    apps: {
      count: context.runningApps.length,
      detail: `${context.runningApps.length} ready now`,
      insight: 'Running apps are the best candidates for private links. Stopped apps will stay hidden from access checks until they are started.',
      kind: 'apps',
      label: 'Running Apps',
      status: context.runningApps.length > 0 ? 'connected' : 'neutral',
    },
    'private-apps': {
      count: context.privateAppAccess.length,
      detail: `${context.privateAppAccess.length} configured`,
      insight: 'These apps are selected for private access. The next phase will verify each link against live Tailscale peer data.',
      kind: 'private-apps',
      label: 'Private Apps',
      status: connected && context.privateAppAccess.length > 0 ? 'connected' : 'warning',
    },
    devices: {
      count: context.devices.length,
      detail: connected ? `${context.devices.filter((device) => device.status === 'connected').length} online now` : 'Waiting for setup',
      deviceDetails: context.devices.map((device) => ({
        connectionType: device.connectionType,
        dnsName: device.dnsName,
        ipAddress: device.ipAddress,
        label: device.label,
        lastSeen: device.lastSeen || device.detail,
        status: device.status,
        statusLabel: device.statusLabel,
      })),
      insight: connected ? 'This list is now backed by Tailscale peer data, including online state and connection path.' : 'Connect Project OS to Tailscale to see phones, laptops, and other devices.',
      kind: 'devices',
      label: 'Your Devices',
      status: connected ? 'connected' : 'warning',
    },
    'public-apps': exposureDetails(context.exposureGroups?.public, 'public-apps', 'Wider Internet Apps', 'Apps in this area are reachable from outside your home network. Keep this list intentionally small.', context.reconciliation),
    'network-apps': exposureDetails(context.exposureGroups?.tailnet, 'network-apps', 'Tailnet Apps', 'Apps in this area are reachable by trusted devices through Tailscale.', context.reconciliation),
    lan: exposureDetails(context.exposureGroups?.lan, 'lan', 'Local Network Apps', 'Apps in this area are reachable from trusted devices on your home network.', context.reconciliation),
    'local-apps': exposureDetails(context.exposureGroups?.local, 'local-apps', 'Local Only Apps', 'Apps in this area stay on the Project OS host. Other devices should not be able to open them directly.', context.reconciliation),
  };
  return details[nodeId] || details['project-os'];
}

export function getRecommendedActions(node: NetworkNodeData, connected: boolean, privateAppCount: number) {
  if (!connected) {
    return ['Connect Project OS to Tailscale.', 'Then choose which apps should be available privately.'];
  }
  if (node.kind === 'public-apps') {
    return node.count && node.count > 0
      ? ['Confirm each public app is intentionally exposed.', 'Prefer private links for apps that do not need the wider internet.']
      : ['No apps are exposed to the wider internet.', 'Keep public access as an intentional advanced choice.'];
  }
  if (node.kind === 'network-apps') {
    return ['These apps are reachable from trusted devices.', 'Use private links when you want access away from home.'];
  }
  if (node.kind === 'local-apps') {
    return ['These apps stay on the Project OS host.', 'Move an app to private access only when other devices should open it.'];
  }
  if (node.kind === 'private-apps' && privateAppCount === 0) {
    return ['Use the Private Apps tab below.', 'Turn on private access for the apps you use away from home.'];
  }
  if (node.kind === 'devices') {
    return ['Add your phone or laptop to the same tailnet.', 'Use online and last-seen status to confirm private links are reachable.'];
  }
  return ['Review private links before sharing them.', 'Keep advanced networking changes intentional and reversible.'];
}

function classifyAppExposure(app: AppRuntimeView, tailscale: TailscaleStatus | null): AppExposureLevel {
  if (app.desiredAccess?.mode === 'public') {
    return 'public';
  }
  if (app.desiredAccess?.mode === 'private' || app.desiredAccess?.mode === 'local-and-private' || app.settings?.tailscaleEnabled) {
    return 'tailnet';
  }
  if (app.desiredAccess?.mode === 'network') {
    return 'lan';
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

function exposureDetails(group: AppExposureGroup | undefined, kind: NetworkNodeData['kind'], label: string, fallbackInsight: string, reconciliation?: PrivateAccessReconciliationReport | null): NetworkNodeData {
  return {
    appDetails: buildNodeAppDetails(group?.apps ?? [], reconciliation),
    count: group?.apps.length ?? 0,
    detail: group?.detail ?? 'No apps in this area',
    insight: group?.apps.length ? `${fallbackInsight} Apps here: ${group.apps.slice(0, 4).map((app) => app.appName).join(', ')}${group.apps.length > 4 ? ', and more.' : '.'}` : fallbackInsight,
    kind,
    label,
    status: group?.status ?? 'neutral',
  };
}

export function buildNodeAppDetails(apps: AppRuntimeView[], reconciliation?: PrivateAccessReconciliationReport | null): NetworkNodeAppDetail[] {
  const reconciliationByAppId = new Map((reconciliation?.apps || []).map((item) => [item.appId, item]));
  return apps.map((app) => buildNodeAppDetail(app, reconciliationByAppId.get(app.appId) || null));
}

function buildNodeAppDetail(app: AppRuntimeView, reconciliation: PrivateAccessReconciliationItem | null): NetworkNodeAppDetail {
  const privateStatus = reconciliation?.status || app.observedAccess?.privateLinkStatus || null;
  return {
    appId: app.appId,
    appName: app.appName,
    exposureLabel: app.desiredAccess?.label || desiredExposureLabel(app),
    expectedLocalPort: reconciliation?.expectedLocalPort ?? app.desiredAccess?.expectedLocalPort ?? app.settings?.expectedLocalPort ?? null,
    observedLocalPort: reconciliation?.expectedPort ?? app.observedAccess?.localPort ?? null,
    privateMapping: reconciliation?.desiredMapping || reconciliation?.target || app.observedAccess?.privateUrl || app.settings?.privateAccessUrl || null,
    privateStatus,
    lastCheckedAt: app.observedAccess?.lastAccessCheckAt || app.healthSnapshot?.checkedAt || null,
    lastVerifiedAt: reconciliation?.verifiedAt || app.observedAccess?.lastSuccessfulAccessAt || null,
    repairNeeded: Boolean(privateStatus && !['configured', 'healthy', 'not_enabled', 'waiting'].includes(privateStatus)),
  };
}

function groupHasPrivateLinkIssue(apps: AppRuntimeView[], reconciliationByAppId: Map<string, PrivateAccessReconciliationItem>) {
  return apps.some((app) => {
    const item = reconciliationByAppId.get(app.appId);
    return item != null && !['healthy', 'waiting'].includes(item.status);
  });
}

function desiredExposureLabel(app: AppRuntimeView) {
  if (app.desiredAccess?.mode === 'public') return 'Wider internet';
  if (app.desiredAccess?.mode === 'private' || app.desiredAccess?.mode === 'local-and-private' || app.settings?.tailscaleEnabled) return 'Tailnet';
  if (app.desiredAccess?.mode === 'network') return 'Local network';
  return 'This device only';
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
