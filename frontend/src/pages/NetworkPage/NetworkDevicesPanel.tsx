import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { statusTone } from './extensions/NetworkPage.theme';
import type { NetworkDeviceView } from './extensions/NetworkPage.types';

export function NetworkDevicesPanel({ devices }: { devices: NetworkDeviceView[] }) {
  return (
    <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
      <CardHeader className="border-b border-white/10 p-5">
        <CardTitle className="text-lg text-white">Your devices</CardTitle>
        <p className="mt-1 text-sm text-slate-400">Phones, laptops, and hosts that can use private links.</p>
      </CardHeader>
      <CardContent className="grid gap-3 p-5 md:grid-cols-2">
        {devices.map((device) => (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/45 p-3" key={device.label}>
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg border', statusTone(device.status, 'soft'))}>
              <device.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="block truncate text-sm font-semibold text-white">{device.label}</span>
                {device.operatingSystem && <span className="shrink-0 text-xs text-slate-500">{device.operatingSystem}</span>}
              </span>
              <span className="block truncate text-xs text-slate-400">{device.detail}</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{device.ipAddress || device.dnsName || device.lastSeen}</span>
            </span>
            <span className="ml-auto grid shrink-0 justify-items-end gap-1">
              <Badge className={cn('border', statusTone(device.status, 'badge'))} variant="outline">{device.statusLabel}</Badge>
              <span className="text-xs capitalize text-slate-500">{device.connectionType}</span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
