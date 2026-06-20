import { CheckCircle2, ChevronRight, Copy, ExternalLink, Laptop, MonitorSmartphone, Pencil, Smartphone, UserPlus, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SurfaceInset, SurfacePanel } from '@/components/project-os/ProjectOSComponents';
import { cn } from '@/lib/utils';
import type { AppRuntimeView } from '@/types/app';
import type { PrivateAccessReconciliationReport, TailscaleDevice, TrustedDeviceView } from '@/types/network';
import { connectionLabel, displayName, formatDate } from './DevicesPage.logic';
import type { DeviceAccess } from './DevicesPage.logic';

export function DeviceRow({ access, device, deviceView, onSelect, selected, showAdvancedMetrics }: { access: DeviceAccess; device: TailscaleDevice; deviceView?: TrustedDeviceView; onSelect: () => void; selected: boolean; showAdvancedMetrics: boolean }) {
  const Icon = deviceIcon(device);
  return (
    <button
      className={cn(
        'grid w-full gap-3 rounded-lg border bg-slate-900/45 p-4 text-left transition hover:border-cyan-300/30 hover:bg-slate-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center',
        selected ? 'border-cyan-300/35 ring-1 ring-cyan-300/20' : 'border-slate-800',
      )}
      onClick={onSelect}
      type="button"
    >
      <span className={cn('grid size-12 place-items-center rounded-lg border', accessTone(access.status, 'soft'))}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-white">{displayName(device, deviceView)}</span>
          {device.self && <Badge className="border-cyan-300/20 bg-cyan-500/10 text-cyan-100">Project OS</Badge>}
          {deviceView?.metadata.trustGroup && <Badge className="border-slate-700 bg-slate-950 text-slate-300">{deviceView.metadata.trustGroup}</Badge>}
          <Badge className={cn('border', accessTone(access.status, 'badge'))}>{access.label}</Badge>
        </span>
        <span className="mt-1 block truncate text-sm text-slate-400">{access.detail}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">
          {device.online ? 'Online now' : `Last seen ${formatDate(device.lastSeen)}`} · {deviceTypeLabel(device)}
        </span>
        {showAdvancedMetrics && <span className="mt-1 block truncate font-mono text-xs text-slate-600">{device.dnsName || device.tailnetIps[0] || 'No private address reported'}</span>}
      </span>
      <span className="flex items-center justify-between gap-3 md:grid md:justify-items-end">
        <span className="text-xs text-slate-500">{deviceView?.metadata.trusted === false ? 'Not expected' : 'Expected access'}</span>
        <ChevronRight className="size-4 text-slate-500" />
      </span>
    </button>
  );
}

export function DeviceDetailCard({ access, copied, device, deviceView, onCopy, onEdit, privateAppCount, showAdvancedMetrics }: { access: DeviceAccess; copied: string | null; device: TailscaleDevice | null; deviceView: TrustedDeviceView | null; onCopy: (value: string | null | undefined, id: string) => void; onEdit?: () => void; privateAppCount: number; showAdvancedMetrics: boolean }) {
  if (!device) {
    return (
      <SurfacePanel className="shadow-none">
        <EmptyState title="No device selected" message="Select a trusted device to see private access details." compact />
      </SurfacePanel>
    );
  }

  const Icon = deviceIcon(device);
  const primaryAddress = device.dnsName || device.tailnetIps[0] || '';
  return (
    <SurfacePanel>
      <div className="flex items-start gap-4">
        <span className={cn('grid size-14 place-items-center rounded-lg border', accessTone(access.status, 'soft'))}>
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-black text-white">{displayName(device, deviceView)}</h2>
            <Badge className={cn('border', accessTone(access.status, 'badge'))}>{access.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">{access.detail}</p>
          {deviceView?.metadata.nickname && <p className="mt-1 text-xs text-slate-500">Tailscale name: {displayName(device)}</p>}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <DetailRow label="Device type" value={deviceTypeLabel(device)} />
        <DetailRow label="Last seen" value={device.online ? 'Online now' : formatDate(device.lastSeen)} />
        <DetailRow label="Trust group" value={deviceView?.metadata.trustGroup || 'Tailnet devices'} />
        <DetailRow label="Expected access" value={deviceView?.metadata.trusted === false ? 'Online, but not expected to use private app links' : 'Can use private app links'} />
        <DetailRow label="Private apps" value={privateAppCount ? `${privateAppCount} apps can be reached when this device is online.` : 'No private apps configured yet.'} />
        {showAdvancedMetrics && (
          <>
            <DetailRow label="Private DNS" value={device.dnsName || 'Not reported'} action={device.dnsName ? (
              <CopyButton copied={copied === 'dns'} onClick={() => onCopy(device.dnsName, 'dns')} />
            ) : null} />
            <DetailRow label="Tailnet address" value={device.tailnetIps[0] || 'Not reported'} action={device.tailnetIps[0] ? (
              <CopyButton copied={copied === 'ip'} onClick={() => onCopy(device.tailnetIps[0], 'ip')} />
            ) : null} />
            <DetailRow label="Operating system" value={device.operatingSystem || 'Unknown'} />
            <DetailRow label="Connection" value={connectionLabel(device)} />
          </>
        )}
      </div>

      {showAdvancedMetrics && (
        <div className="mt-3 rounded-lg border border-cyan-300/15 bg-cyan-500/5 p-3 text-xs leading-5 text-cyan-50/80">
          Tailscale is the private network Project OS uses for trusted devices. DNS names and tailnet IPs are technical addresses from that network.
        </div>
      )}

      {deviceView?.metadata.notes && (
        <SurfaceInset className="mt-3 text-sm text-slate-300">
          {deviceView.metadata.notes}
        </SurfaceInset>
      )}

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {onEdit && (
          <Button className="border-cyan-300/25 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15" onClick={onEdit} type="button" variant="outline">
            <Pencil className="size-4" />
            Edit device label
          </Button>
        )}
        {showAdvancedMetrics && primaryAddress && (
          <Button className="w-full border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onCopy(primaryAddress, 'primary')} type="button" variant="outline">
            {copied === 'primary' ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
            {copied === 'primary' ? 'Copied' : 'Copy device address'}
          </Button>
        )}
      </div>
    </SurfacePanel>
  );
}

export function OnboardingCard({ steps }: { steps: string[] }) {
  const visibleSteps = steps.length ? steps : [
    'Install Tailscale on the phone, laptop, or tablet you want to use.',
    'Sign in with the same Tailscale account or join the same tailnet.',
    'Open a Project OS private app link from that device.',
    'Return here to give the device a friendly name.',
  ];
  return (
    <SurfacePanel className="border-cyan-300/15 bg-cyan-500/5 shadow-po-panel">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-500/10 text-cyan-100">
          <UserPlus className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-black text-white">Add a phone or laptop</h2>
          <p className="mt-1 text-sm text-slate-400">Use this when someone needs private app access from another device.</p>
        </div>
      </div>
      <ol className="mt-4 space-y-2">
        {visibleSteps.map((step, index) => (
          <li className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300" key={step}>
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cyan-500/15 text-xs font-black text-cyan-100">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <Button asChild className="mt-4 w-full border-cyan-300/25 bg-slate-950/50 text-cyan-100 hover:bg-slate-900" variant="outline">
        <Link to="/network">Open network setup <ChevronRight className="size-4" /></Link>
      </Button>
    </SurfacePanel>
  );
}

export function PrivateAppsCard({ apps, reconciliation }: { apps: AppRuntimeView[]; reconciliation: PrivateAccessReconciliationReport | null }) {
  return (
    <SurfacePanel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">Private app links</h2>
          <p className="mt-1 text-sm text-slate-400">Apps your trusted devices should be able to reach.</p>
        </div>
        <Button asChild className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
          <Link to="/network">Manage <ExternalLink className="size-3.5" /></Link>
        </Button>
      </div>
      <div className="mt-4 grid gap-3">
        {apps.length ? apps.slice(0, 6).map((app) => {
          const access = reconciliation?.apps.find((item) => item.appId === app.appId);
          return (
            <SurfaceInset key={app.appId}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-white">{app.appName}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{access?.expectedPrivateUrl || app.observedAccess?.privateUrl || app.settings?.privateAccessUrl || 'Private link pending'}</p>
                </div>
                <Badge className={cn('shrink-0 border', access?.status === 'healthy' ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100' : 'border-amber-300/20 bg-amber-500/10 text-amber-100')}>
                  {access?.status === 'healthy' ? 'Ready' : 'Check'}
                </Badge>
              </div>
            </SurfaceInset>
          );
        }) : (
          <EmptyState title="No private apps yet" message="Apps with private access will appear here after installation or setup." compact />
        )}
      </div>
    </SurfacePanel>
  );
}

export function SignalCard({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'green' | 'amber' | 'red' | 'slate' | 'violet' | 'cyan'; value: string }) {
  const tones = {
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    red: 'border-red-300/20 bg-red-500/10 text-red-100',
    slate: 'border-slate-700/60 bg-slate-900/55 text-slate-300',
    violet: 'border-violet-300/20 bg-violet-500/10 text-violet-100',
    cyan: 'border-cyan-300/20 bg-cyan-500/10 text-cyan-100',
  };
  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-current/70">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className="mt-3 line-clamp-2 text-xl font-black text-white">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-current/75">{detail}</p>
    </div>
  );
}

export function EmptyState({ compact = false, message, title }: { compact?: boolean; message: string; title: string }) {
  return (
    <div className={cn('rounded-lg border border-slate-800 bg-slate-900/40 text-center', compact ? 'p-4' : 'p-8')}>
      <p className="font-bold text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
    </div>
  );
}

function DetailRow({ action, label, value }: { action?: React.ReactNode; label: string; value: string }) {
  return (
    <SurfaceInset className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <p className="mt-1 truncate text-sm text-slate-200" title={value}>{value}</p>
      </div>
      {action}
    </SurfaceInset>
  );
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <Button className="size-8 shrink-0 border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={onClick} size="icon" type="button" variant="outline">
      {copied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}

function deviceIcon(device: TailscaleDevice): LucideIcon {
  const os = (device.operatingSystem || '').toLowerCase();
  if (os.includes('ios') || os.includes('android')) {
    return Smartphone;
  }
  if (os.includes('windows') || os.includes('mac') || os.includes('linux')) {
    return Laptop;
  }
  if (!device.online) {
    return WifiOff;
  }
  return MonitorSmartphone;
}

function deviceTypeLabel(device: TailscaleDevice) {
  const os = (device.operatingSystem || '').toLowerCase();
  if (os.includes('ios') || os.includes('android')) return 'Phone or tablet';
  if (os.includes('windows') || os.includes('mac') || os.includes('linux')) return 'Computer';
  if (device.self) return 'Project OS host';
  return 'Trusted device';
}

function accessTone(status: DeviceAccess['status'], mode: 'soft' | 'badge') {
  const tones = {
    ready: {
      soft: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
      badge: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    },
    verified: {
      soft: 'border-cyan-300/25 bg-cyan-500/10 text-cyan-100',
      badge: 'border-cyan-300/25 bg-cyan-500/10 text-cyan-100',
    },
    offline: {
      soft: 'border-slate-700 bg-slate-900 text-slate-400',
      badge: 'border-slate-700 bg-slate-950 text-slate-300',
    },
    'needs-setup': {
      soft: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
      badge: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    },
    limited: {
      soft: 'border-cyan-300/20 bg-cyan-500/10 text-cyan-100',
      badge: 'border-cyan-300/20 bg-cyan-500/10 text-cyan-100',
    },
    'not-expected': {
      soft: 'border-slate-700 bg-slate-900 text-slate-300',
      badge: 'border-slate-700 bg-slate-950 text-slate-300',
    },
    warning: {
      soft: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
      badge: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    },
  };
  return tones[status][mode];
}
