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
import { tailscaleSetupGuidance, tailscaleSetupTasks } from './extensions/NetworkPage.tailscaleSetup';
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
  const tailscaleGuidance = tailscaleSetupGuidance(tailscale);
  const tailscaleTasks = tailscaleSetupTasks({ tailscale, reconciliation });
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
            <PrivateLinksTable
              copiedAppId={copiedAppId}
              loadingAppId={loadingAppId}
              onCopyPrivateLink={onCopyPrivateLink}
              onRepairPrivateAccess={onRepairPrivateAccess}
              onTurnOffPrivateAccess={onTurnOffPrivateAccess}
              privateAppAccess={privateAppAccess}
            />
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
        <CardHeader className="border-b border-white/10 p-5">
          <CardTitle className="text-lg text-white">Make apps private</CardTitle>
          <p className="mt-1 text-sm text-slate-400">Pick local apps that should be easy to reach from your own devices.</p>
        </CardHeader>
        <CardContent className="grid gap-3 p-5">
          <TailscaleSetupCard guidance={tailscaleGuidance} tasks={tailscaleTasks} />
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
          {localApps.length > 5 && <p className="text-xs text-slate-500">{localApps.length - 5} more app(s) can be managed from My Apps.</p>}
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

function PrivateLinksTable({
  copiedAppId,
  loadingAppId,
  onCopyPrivateLink,
  onRepairPrivateAccess,
  onTurnOffPrivateAccess,
  privateAppAccess,
}: {
  copiedAppId: string | null;
  loadingAppId: string | null;
  onCopyPrivateLink: (appId: string, url: string | null) => void;
  onRepairPrivateAccess: (app: AppRuntimeView) => void;
  onTurnOffPrivateAccess: (app: AppRuntimeView) => void;
  privateAppAccess: PrivateAppAccess[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(180px,1.2fr)_minmax(180px,1.2fr)_120px_190px] gap-3 border-b border-white/10 bg-slate-950/60 px-4 py-2 text-xs font-bold uppercase tracking-normal text-slate-500 lg:grid">
        <span>App</span>
        <span>Local URL</span>
        <span>Private URL</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-white/5">
        {privateAppAccess.map((access) => (
          <div className="grid gap-3 bg-slate-900/35 p-4 lg:grid-cols-[minmax(150px,1fr)_minmax(180px,1.2fr)_minmax(180px,1.2fr)_120px_190px] lg:items-center" key={access.app.appId}>
            <div className="min-w-0">
              <p className="m-0 truncate font-semibold text-white">{access.app.appName}</p>
              {access.reconciliation && access.reconciliation.status !== 'healthy' && <p className="mt-1 line-clamp-2 text-xs text-amber-100">{access.reconciliation.detail}</p>}
            </div>
            <CompactUrl label="Local" value={access.localUrl || 'No local link yet'} />
            <CompactUrl label="Private" value={access.privateUrl || 'Connect Tailscale to create this link'} />
            <Badge className={cn('w-fit border', statusTone(access.status, 'badge'))} variant="outline">{access.statusLabel}</Badge>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {access.privateUrl ? (
                <Button asChild className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
                  <a href={access.privateUrl} rel="noreferrer" target="_blank">
                    <ExternalLink className="size-3.5" />
                    Open
                  </a>
                </Button>
              ) : (
                <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled size="sm" type="button" variant="outline">
                  <ExternalLink className="size-3.5" />
                  Open
                </Button>
              )}
              <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={!access.privateUrl} onClick={() => onCopyPrivateLink(access.app.appId, access.privateUrl)} size="sm" type="button" variant="outline">
                {copiedAppId === access.app.appId ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
                {copiedAppId === access.app.appId ? 'Copied' : 'Copy'}
              </Button>
              <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={loadingAppId === access.app.appId} onClick={() => onRepairPrivateAccess(access.app)} size="sm" type="button" variant="outline">
                <Wrench className={cn('size-3.5', loadingAppId === access.app.appId && 'animate-pulse')} />
                Check
              </Button>
              <Button aria-label={`Turn off private access for ${access.app.appName}`} className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={loadingAppId === access.app.appId} onClick={() => onTurnOffPrivateAccess(access.app)} size="icon-sm" type="button" variant="outline">
                <ShieldOff className={cn('size-3.5', loadingAppId === access.app.appId && 'animate-pulse')} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactUrl({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-xs font-bold uppercase tracking-normal text-slate-500 lg:hidden">{label}</p>
      <p className="m-0 truncate text-sm text-slate-300" title={value}>{value}</p>
    </div>
  );
}

function TailscaleSetupCard({ guidance, tasks }: { guidance: ReturnType<typeof tailscaleSetupGuidance>; tasks: ReturnType<typeof tailscaleSetupTasks> }) {
  const tone = guidance.tone === 'green'
    ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
    : guidance.tone === 'red'
      ? 'border-red-300/20 bg-red-500/10 text-red-100'
      : 'border-amber-300/20 bg-amber-500/10 text-amber-100';
  return (
    <div className={cn('rounded-lg border p-4', tone)}>
      <div className="flex items-start gap-3">
        {guidance.goodState ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <Lock className="mt-0.5 size-5 shrink-0" />}
        <div className="min-w-0">
          <p className="font-bold text-white">{guidance.title}</p>
          <p className="mt-1 text-sm leading-6 text-current/80">{guidance.summary}</p>
          <p className="mt-1 text-xs leading-5 text-current/70">{guidance.action}</p>
          {!guidance.goodState && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild className="border-white/15 bg-slate-950/55 text-current hover:bg-slate-900" size="sm" type="button" variant="outline">
                <a href="https://login.tailscale.com/start" rel="noreferrer" target="_blank">
                  <ExternalLink className="size-3.5" />
                  Create or sign in
                </a>
              </Button>
              <Button asChild className="border-white/15 bg-slate-950/55 text-current hover:bg-slate-900" size="sm" type="button" variant="outline">
                <a href="https://tailscale.com/kb/1017/install" rel="noreferrer" target="_blank">
                  <ExternalLink className="size-3.5" />
                  Tailscale setup
                </a>
              </Button>
            </div>
          )}
          <div className="mt-3 grid gap-2">
            {tasks.slice(0, guidance.goodState ? 3 : 1).map((task) => (
              <div className="rounded-md border border-white/10 bg-slate-950/35 px-3 py-2" key={task.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">{task.title}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase', task.status === 'ok' ? 'bg-emerald-500/15 text-emerald-100' : task.status === 'warning' ? 'bg-amber-500/15 text-amber-100' : 'bg-slate-700/70 text-slate-200')}>
                    {task.status === 'ok' ? 'Ready' : task.status === 'warning' ? 'To do' : 'Review'}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-current/70">{task.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
