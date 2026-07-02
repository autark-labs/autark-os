import { AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AppRuntimeView } from '@/types/app';
import type { TailscaleStatus } from '@/types/network';
import { getRecommendedActions } from './extensions/NetworkPage.logic';
import { networkNodeIcons, statusTone } from './extensions/NetworkPage.theme';
import type { NetworkNodeData } from './extensions/NetworkPage.types';

export function NetworkNodeDetails({
  onReviewPrivateLinks,
  privateApps,
  selectedNode,
  showAdvancedMetrics,
  tailscale,
}: {
  onReviewPrivateLinks: () => void;
  privateApps: AppRuntimeView[];
  selectedNode: NetworkNodeData;
  showAdvancedMetrics: boolean;
  tailscale: TailscaleStatus | null;
}) {
  const connected = Boolean(tailscale?.connected);
  const Icon = networkNodeIcons[selectedNode.kind];
  const review = getReviewCopy(selectedNode, connected);
  const actions = getRecommendedActions(selectedNode, connected, privateApps.length);
  const hasRepairableApps = selectedNode.appDetails?.some((app) => app.repairNeeded) ?? false;

  return (
    <Card className="border-sky-400/30 bg-slate-900 py-0 text-slate-100 shadow-xl shadow-slate-950/30">
      <CardHeader className="border-b border-sky-400/25 p-5">
        <div className="flex items-start gap-3">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg border', statusTone(selectedNode.status, 'soft'))}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access review</p>
            <CardTitle className="mt-1 truncate text-lg text-white">{selectedNode.label}</CardTitle>
            <p className="mt-1 text-sm text-slate-400">{selectedNode.detail}</p>
          </div>
          <Badge className={cn('shrink-0 border', statusTone(selectedNode.status, 'badge'))} variant="outline">
            {review.badge}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-5">
        <section className="grid gap-3">
          <ReviewBlock label="What this is" value={review.represents} />
          <ReviewBlock label="Safety check" tone={selectedNode.status} value={review.safety} />
          <p className="rounded-lg border border-sky-400/25 bg-slate-800 p-3 text-sm leading-6 text-slate-300">{selectedNode.insight}</p>
        </section>

        {selectedNode.appDetails && selectedNode.appDetails.length > 0 && (
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Affected apps</p>
              {hasRepairableApps && (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/25 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-100">
                  <AlertTriangle className="size-3" />
                  Repair available
                </span>
              )}
            </div>
            <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
              {selectedNode.appDetails.map((app) => (
                <div className="rounded-lg border border-sky-400/25 bg-slate-800 p-3" key={app.appId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{app.appName}</p>
                      <p className="mt-1 text-xs text-slate-400">{app.exposureLabel}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium', app.repairNeeded ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100')}>
                      {app.repairNeeded ? 'Needs repair' : friendlyPrivateStatus(app.privateStatus)}
                    </span>
                  </div>
                  {app.repairNeeded && <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">This private link needs attention. Use Private app links below to repair it.</p>}
                  {showAdvancedMetrics && (
                    <div className="mt-3 grid gap-2 text-xs text-slate-400">
                      <DetailLine label="Expected port" value={formatValue(app.expectedLocalPort)} />
                      <DetailLine label="Observed port" value={formatValue(app.observedLocalPort)} />
                      <DetailLine label="Private route" value={app.privateMapping || 'Not configured'} />
                      <DetailLine label="Last checked" value={formatDate(app.lastCheckedAt)} />
                      <DetailLine label="Last verified" value={formatDate(app.lastVerifiedAt)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedNode.deviceDetails && selectedNode.deviceDetails.length > 0 && (
          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Affected devices</p>
            <div className="grid max-h-[320px] gap-2 overflow-y-auto pr-1">
              {selectedNode.deviceDetails.map((device) => (
                <div className="rounded-lg border border-sky-400/25 bg-slate-800 p-3" key={`${device.label}-${device.ipAddress || device.dnsName}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{device.label}</p>
                      <p className="mt-1 text-xs text-slate-400">{device.lastSeen}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium', statusTone(device.status, 'badge'))}>{device.statusLabel}</span>
                  </div>
                  {showAdvancedMetrics && (
                    <div className="mt-3 grid gap-2 text-xs text-slate-400">
                      <DetailLine label="Tailscale DNS" value={device.dnsName || 'Unknown'} />
                      <DetailLine label="Tailscale IP" value={device.ipAddress || 'Unknown'} />
                      <DetailLine label="Connection" value={device.connectionType || 'Unknown'} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended action</p>
          {actions.map((action) => (
            <div className="flex gap-3 rounded-lg border border-sky-400/25 bg-slate-800 p-3 text-sm text-slate-300" key={action}>
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan-200" />
              <span>{action}</span>
            </div>
          ))}
          {hasRepairableApps && (
            <Button className="mt-1 border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15" onClick={onReviewPrivateLinks} type="button" variant="outline">
              <ListChecks className="size-4" />
              Review repair options
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewBlock({ label, tone = 'neutral', value }: { label: string; tone?: NetworkNodeData['status']; value: string }) {
  return (
    <div className={cn('rounded-lg border p-3', tone === 'warning' ? 'border-amber-300/20 bg-amber-500/10' : 'border-sky-400/25 bg-slate-800')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('mt-1 text-sm leading-6', tone === 'warning' ? 'text-amber-100' : 'text-slate-300')}>{value}</p>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-right text-slate-300">{value}</span>
    </div>
  );
}

function formatValue(value: number | null) {
  return value == null ? 'Unknown' : String(value);
}

function formatDate(value: string | null) {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function friendlyPrivateStatus(value: string | null) {
  if (!value || value === 'not_enabled') return 'No private link';
  if (value === 'healthy' || value === 'configured') return 'Verified';
  if (value === 'waiting') return 'Waiting';
  return value.replace(/_/g, ' ');
}

function getReviewCopy(node: NetworkNodeData, connected: boolean) {
  const badge = node.status === 'warning' ? 'Needs review' : node.status === 'connected' ? 'Looks safe' : 'Informational';
  const represents: Record<NetworkNodeData['kind'], string> = {
    apps: 'Apps currently running on this Project OS server.',
    devices: 'Phones, laptops, and other trusted devices in your private network.',
    internet: 'People and services outside your home and private network.',
    lan: 'Apps reachable by devices connected to your home network.',
    'local-apps': 'Apps that should stay available only on this server.',
    'network-apps': 'Apps shared with your trusted private devices.',
    'private-apps': 'Apps selected for private access.',
    'project-os': 'This Project OS server and its private access connection.',
    'public-apps': 'Apps that may be reachable from the wider internet.',
    router: 'Your home network boundary.',
  };

  if (!connected) {
    return {
      badge,
      represents: represents[node.kind],
      safety: 'Private access is not ready yet. Connect Project OS to Tailscale before relying on private links.',
    };
  }

  if (node.status === 'warning') {
    return {
      badge,
      represents: represents[node.kind],
      safety: node.kind === 'public-apps'
        ? 'One or more apps may be reachable beyond your trusted devices. Confirm this is intentional.'
        : 'Something in this area needs attention before access can be considered clean.',
    };
  }

  return {
    badge,
    represents: represents[node.kind],
    safety: node.status === 'connected'
      ? 'This area matches the current access plan. Keep reviewing changes when you install apps or enable new links.'
      : 'Nothing here currently expands app access, but it is still useful context for the map.',
  };
}
