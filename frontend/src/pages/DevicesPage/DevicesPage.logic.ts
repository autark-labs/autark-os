import type { AppRuntimeView } from '@/types/app';
import type { TailscaleDevice, TailscaleStatus, TrustedDeviceView } from '@/types/network';

export type DeviceAccess = {
  detail: string;
  label: string;
  status: 'verified' | 'ready' | 'offline' | 'needs-setup' | 'limited' | 'not-expected' | 'warning';
};

export function accessForDevice(device: TailscaleDevice | null, tailscale: TailscaleStatus | null, privateAppCount: number, deviceView?: TrustedDeviceView | null): DeviceAccess {
  if (deviceView) {
    return mapReachability(deviceView.reachability.status, deviceView.reachability.label, deviceView.reachability.detail);
  }
  if (!tailscale?.connected) {
    return { status: 'needs-setup', label: 'Needs Tailscale', detail: 'Connect this Project OS host to Tailscale first.' };
  }
  if (!device) {
    return { status: 'limited', label: 'Unknown', detail: 'No device selected.' };
  }
  if (!device.online) {
    return { status: 'offline', label: 'Offline', detail: 'This device cannot reach private apps until it reconnects.' };
  }
  if (!privateAppCount) {
    return { status: 'limited', label: 'Ready', detail: 'This device is online. No private apps are configured yet.' };
  }
  if (device.self) {
    return { status: 'ready', label: 'Coordinator', detail: 'This Project OS device coordinates private app access.' };
  }
  return { status: 'ready', label: 'Ready', detail: `This device should be able to reach ${privateAppCount} private app${privateAppCount === 1 ? '' : 's'}.` };
}

export function isPrivateApp(app: AppRuntimeView) {
  return app.desiredAccess?.mode === 'private'
    || app.desiredAccess?.mode === 'local-and-private'
    || Boolean(app.settings?.tailscaleEnabled)
    || Boolean(app.observedAccess?.privateUrl)
    || Boolean(app.settings?.privateAccessUrl);
}

export function displayName(device: TailscaleDevice, deviceView?: TrustedDeviceView | null) {
  return deviceView?.metadata.nickname || device.name || device.dnsName || device.tailnetIps[0] || 'Unnamed device';
}

export function connectionLabel(device: TailscaleDevice) {
  if (!device.online) {
    return 'Offline';
  }
  if (device.connectionType === 'relay' && device.relay) {
    return `Relay through ${device.relay}`;
  }
  if (device.connectionType === 'direct') {
    return 'Direct connection';
  }
  return device.connectionType || 'Unknown';
}

export function formatDate(value?: string | null) {
  if (!value) {
    return 'Not reported';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function mapReachability(status: string, label: string, detail: string): DeviceAccess {
  const mappedStatus: DeviceAccess['status'] = (() => {
    switch (status) {
      case 'verified_from_project_os':
        return 'verified';
      case 'not_expected':
        return 'not-expected';
      case 'partial':
      case 'needs_attention':
        return 'warning';
      case 'offline':
        return 'offline';
      case 'needs_setup':
        return 'needs-setup';
      case 'no_private_apps':
        return 'limited';
      default:
        return 'ready';
    }
  })();
  return { status: mappedStatus, label, detail };
}
