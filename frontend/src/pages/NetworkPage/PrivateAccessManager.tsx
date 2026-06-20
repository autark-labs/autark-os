import { CheckCircle2, Copy, ExternalLink, Lock, Server, ShieldOff, Trash2, Wrench } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AppRuntimeView } from '@/types/app';
import type { PrivateAccessReconciliationReport, TailscaleStatus } from '@/types/network';
import { statusTone } from './extensions/NetworkPage.theme';
import type { PrivateAppAccess } from './extensions/NetworkPage.types';
import { AccessLine, EmptyState } from './NetworkPage.shared';

export function PrivateAccessManager({
  copiedAppId,
  installedApps,
  loadingAppId,
  onCopyPrivateLink,
  onEnablePrivateAccess,
  onRepairPrivateAccess,
  onRemoveStaleMapping,
  onTurnOffPrivateAccess,
  privateAppAccess,
  reconciliation,
  tailscale,
}: {
  copiedAppId: string | null;
  installedApps: AppRuntimeView[];
  loadingAppId: string | null;
  onCopyPrivateLink: (appId: string, url: string | null) => void;
  onEnablePrivateAccess: (app: AppRuntimeView) => void;
  onRemoveStaleMapping: (port: number) => void;
  onRepairPrivateAccess: (app: AppRuntimeView) => void;
  onTurnOffPrivateAccess: (app: AppRuntimeView) => void;
  privateAppAccess: PrivateAppAccess[];
  reconciliation: PrivateAccessReconciliationReport | null;
  tailscale: TailscaleStatus | null;
}) {
  const localApps = installedApps.filter((app) => app.desiredAccess?.mode !== 'private' && app.desiredAccess?.mode !== 'local-and-private' && !app.settings?.tailscaleEnabled);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
        <CardHeader className="border-b border-white/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-white">Private app links</CardTitle>
              <p className="mt-1 text-sm text-slate-400">{reconciliation?.summary || 'Apps you can open from your private devices.'}</p>
            </div>
            <Badge className={cn('border', tailscale?.connected ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-amber-300/25 bg-amber-500/10 text-amber-200')} variant="outline">
              {tailscale?.connected ? 'Private network ready' : 'Setup needed'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-5">
          {privateAppAccess.length === 0 ? (
            <EmptyState icon={Lock} title="No private apps yet" text="Choose which apps should be available away from home. Project OS will create private links after Tailscale is connected." />
          ) : (
            privateAppAccess.map((access) => (
              <div className="grid gap-3 rounded-lg border border-white/10 bg-slate-900/45 p-4 md:grid-cols-[minmax(0,1fr)_auto]" key={access.app.appId}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-white">{access.app.appName}</h3>
                    <Badge className={cn('border', statusTone(access.status, 'badge'))} variant="outline">{access.statusLabel}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <AccessLine label="Private link" value={access.privateUrl || 'Connect Tailscale to create this link'} />
                    <AccessLine label="At home" value={access.localUrl || 'No local link yet'} />
                    {access.reconciliation?.verifiedAt && <AccessLine label="Verified by Tailscale" value={new Date(access.reconciliation.verifiedAt).toLocaleString()} />}
                    {access.reconciliation?.desiredMapping && <AccessLine label="Expected route" value={access.reconciliation.desiredMapping} />}
                    {access.reconciliation?.target && <AccessLine label="Tailscale routes to" value={access.reconciliation.target} />}
                    {access.reconciliation?.matchReason && <p className="rounded-md border border-slate-700/30 bg-slate-950/35 px-3 py-2 text-xs text-slate-400">{access.reconciliation.matchReason}</p>}
                    {access.reconciliation && access.reconciliation.status !== 'healthy' && <p className="rounded-md border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{access.reconciliation.detail}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={loadingAppId === access.app.appId} onClick={() => onRepairPrivateAccess(access.app)} type="button" variant="outline">
                    <Wrench className={cn('size-4', loadingAppId === access.app.appId && 'animate-pulse')} />
                    Repair private link
                  </Button>
                  <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={loadingAppId === access.app.appId} onClick={() => onTurnOffPrivateAccess(access.app)} type="button" variant="outline">
                    <ShieldOff className={cn('size-4', loadingAppId === access.app.appId && 'animate-pulse')} />
                    Turn off private access
                  </Button>
                  <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={!access.privateUrl} onClick={() => onCopyPrivateLink(access.app.appId, access.privateUrl)} type="button" variant="outline">
                    {copiedAppId === access.app.appId ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
                    {copiedAppId === access.app.appId ? 'Copied' : 'Copy'}
                  </Button>
                  {access.privateUrl ? (
                    <Button asChild className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" variant="outline">
                      <a href={access.privateUrl} rel="noreferrer" target="_blank">
                        <ExternalLink className="size-4" />
                        Open
                      </a>
                    </Button>
                  ) : (
                    <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled type="button" variant="outline">
                      <ExternalLink className="size-4" />
                      Open
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
        <CardHeader className="border-b border-white/10 p-5">
          <CardTitle className="text-lg text-white">Make apps private</CardTitle>
          <p className="mt-1 text-sm text-slate-400">Pick local apps that should be easy to reach from your own devices.</p>
        </CardHeader>
        <CardContent className="grid gap-3 p-5">
          {localApps.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All apps reviewed" text="Every installed app is already marked for private access or there are no local apps yet." />
          ) : (
            localApps.slice(0, 5).map((app) => (
              <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/45 p-3" key={app.appId}>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-600/40 bg-slate-900/70 text-slate-300">
                  <Server className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{app.appName}</span>
                  <span className="block truncate text-xs text-slate-400">{app.accessUrl || app.settings?.accessUrl || 'No local link yet'}</span>
                </span>
                <Button className="ml-auto shrink-0 bg-violet-600 text-white hover:bg-violet-500" disabled={!tailscale?.connected || loadingAppId === app.appId} onClick={() => onEnablePrivateAccess(app)} type="button">
                  <Lock className={cn('size-4', loadingAppId === app.appId && 'animate-pulse')} />
                  Turn on private access
                </Button>
              </div>
            ))
          )}
          {localApps.length > 5 && <p className="text-xs text-slate-500">{localApps.length - 5} more app(s) can be managed from Applications.</p>}
          {!tailscale?.connected && <p className="text-xs text-amber-200">Connect Project OS to Tailscale before enabling private app links.</p>}
        </CardContent>
      </Card>

      {reconciliation?.staleMappings?.length ? (
        <Card className="border-amber-300/20 bg-amber-500/10 py-0 text-amber-50 xl:col-span-2">
          <CardHeader className="border-b border-amber-300/15 p-5">
            <CardTitle className="text-lg text-amber-50">Stale links to review</CardTitle>
            <p className="mt-1 text-sm text-amber-100/75">These Tailscale Serve links do not match an installed app that currently wants private access.</p>
          </CardHeader>
          <CardContent className="grid gap-3 p-5">
            {reconciliation.staleMappings.map((mapping) => (
              <div className="grid gap-3 rounded-lg border border-amber-300/20 bg-slate-950/45 p-4 md:grid-cols-[minmax(0,1fr)_auto]" key={mapping.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-white">HTTPS port {mapping.servePort ?? 'unknown'}</h3>
                    <Badge className="border-amber-300/25 bg-amber-400/10 text-amber-100" variant="outline">Review stale mapping</Badge>
                  </div>
                  <p className="mt-2 text-sm text-amber-100/80">{mapping.detail}</p>
                  <div className="mt-3 grid gap-2 text-sm">
                    <AccessLine label="Endpoint" value={mapping.endpoint || 'Unknown endpoint'} />
                    <AccessLine label="Routes to" value={mapping.target || 'Unknown target'} />
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="border-amber-300/30 bg-slate-950/50 text-amber-100 hover:bg-slate-900" disabled={!mapping.servePort || loadingAppId === `stale-${mapping.servePort}`} type="button" variant="outline">
                      <Trash2 className={cn('size-4', loadingAppId === `stale-${mapping.servePort}` && 'animate-pulse')} />
                      Review stale link
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-amber-300/20 bg-slate-950 text-slate-100">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this stale private link?</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-400">
                        Project OS will remove the Tailscale Serve entry for HTTPS port {mapping.servePort ?? 'unknown'}. This should only affect the stale endpoint shown here:
                        {mapping.endpoint ? ` ${mapping.endpoint}` : ' unknown endpoint'}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                      Active app links should be turned off from the app or private links section. This cleanup is only for links that no longer match an installed app.
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">Keep link</AlertDialogCancel>
                      <AlertDialogAction className="bg-amber-500 text-slate-950 hover:bg-amber-400" onClick={() => mapping.servePort && onRemoveStaleMapping(mapping.servePort)}>
                        Remove stale link
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
