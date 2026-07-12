import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { cn } from '@/lib/utils';
import { networkStatusTone, statusTone } from './extensions/NetworkPage.theme';
import type { NetworkDeviceView } from './extensions/NetworkPage.types';
import { NetworkInset, NetworkPanel } from './NetworkPage.shared';

export function NetworkDevicesPanel({ devices }: { devices: NetworkDeviceView[] }) {
  return (
    <NetworkPanel
      description="Phones, laptops, and hosts that can use private links."
      title="Your devices"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {devices.map((device) => (
          <NetworkInset className="flex items-center gap-3" key={device.label}>
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg border', statusTone(device.status, 'soft'))}>
              <device.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="block truncate text-sm font-semibold text-slate-50">{device.label}</span>
                {device.operatingSystem && <span className="shrink-0 text-xs text-sky-100/70">{device.operatingSystem}</span>}
              </span>
              <span className="block truncate text-xs text-sky-100/65">{device.detail}</span>
              <span className="mt-1 block truncate text-xs text-sky-100/70">{device.ipAddress || device.dnsName || device.lastSeen}</span>
            </span>
            <span className="ml-auto grid shrink-0 justify-items-end gap-1">
              <StatusBadge tone={networkStatusTone(device.status)}>{device.statusLabel}</StatusBadge>
              <span className="text-xs capitalize text-sky-100/70">{device.connectionType}</span>
            </span>
          </NetworkInset>
        ))}
      </div>
    </NetworkPanel>
  );
}
