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
import {
  ProjectDarkControlButton,
  ProjectOpenButton,
  ProjectPrimaryButton,
  ProjectWarningButton,
} from '@/components/primitives/ProjectButtons';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { cn } from '@/lib/utils';
import type { AppRuntimeView } from '@/types/app';
import type { PrivateAccessReconciliationReport, TailscaleStatus } from '@/types/network';
import { tailscaleSetupGuidance, tailscaleSetupTasks } from './extensions/NetworkPage.tailscaleSetup';
import { statusTone } from './extensions/NetworkPage.theme';
import type { PrivateAppAccess } from './extensions/NetworkPage.types';
import { AccessLine, EmptyState, NetworkInset, NetworkPanel } from './NetworkPage.shared';

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
      <NetworkPanel
        action={
            <Badge className={cn('border', tailscale?.connected ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200' : 'border-orange-400/45 bg-orange-500/10 text-orange-200')} variant="outline">
              {tailscale?.connected ? 'Private network ready' : 'Setup needed'}
            </Badge>
        }
        description={reconciliation?.summary || 'Apps you can open from your private devices.'}
        title="Private app links"
      >
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
      </NetworkPanel>

      <NetworkPanel
        description="Pick local apps that should be easy to reach from your own devices."
        title="Make apps private"
      >
          <TailscaleSetupCard guidance={tailscaleGuidance} tasks={tailscaleTasks} />
          {localApps.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All apps reviewed" text="Every installed app is already marked for private access or there are no local apps yet." />
          ) : (
            localApps.slice(0, 5).map((app) => (
              <NetworkInset className="flex items-center gap-3" key={app.appId}>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-sky-400/20 bg-slate-900 text-sky-100/75">
                  <Server className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-50">{app.appName}</span>
                  <span className="block truncate text-xs text-sky-100/60">{app.accessUrl || app.settings?.accessUrl || 'No local link yet'}</span>
                </span>
                <DisabledAction className="ml-auto shrink-0" disabled={!tailscale?.connected || loadingAppId === app.appId} reason={!tailscale?.connected ? 'Connect Tailscale before enabling private app links.' : 'Wait for the current private access update to finish.'}>
                  <ProjectPrimaryButton className="ml-auto shrink-0" disabled={!tailscale?.connected || loadingAppId === app.appId} onClick={() => onEnablePrivateAccess(app)} type="button">
                    <Lock className={cn('size-4', loadingAppId === app.appId && 'animate-pulse')} />
                    Turn on private access
                  </ProjectPrimaryButton>
                </DisabledAction>
              </NetworkInset>
            ))
          )}
          {localApps.length > 5 && <p className="text-xs text-sky-100/50">{localApps.length - 5} more app(s) can be managed from My Apps.</p>}
          {!tailscale?.connected && <p className="text-xs text-orange-200">Connect Project OS to Tailscale before enabling private app links.</p>}
      </NetworkPanel>

      {reconciliation?.staleMappings?.length ? (
        <NetworkPanel
          className="border-orange-400/45 xl:col-span-2"
          description="These Tailscale Serve links do not match an installed app that currently wants private access."
          title="Stale links to review"
        >
            {reconciliation.staleMappings.map((mapping) => (
              <NetworkInset className="grid gap-3 rounded-lg border-orange-400/30 p-4 md:grid-cols-[minmax(0,1fr)_auto]" key={mapping.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-50">HTTPS port {mapping.servePort ?? 'unknown'}</h3>
                    <Badge className="border-orange-400/45 bg-orange-500/10 text-orange-200" variant="outline">Review stale mapping</Badge>
                  </div>
                  <p className="mt-2 text-sm text-orange-100/80">{mapping.detail}</p>
                  <div className="mt-3 grid gap-2 text-sm">
                    <AccessLine label="Endpoint" value={mapping.endpoint || 'Unknown endpoint'} />
                    <AccessLine label="Routes to" value={mapping.target || 'Unknown target'} />
                  </div>
                </div>
                <AlertDialog>
                  <DisabledAction disabled={!mapping.servePort || loadingAppId === `stale-${mapping.servePort}`} reason={!mapping.servePort ? 'Project OS needs the stale Tailscale port before it can review cleanup.' : 'Project OS is already reviewing this stale private link.'}>
                    <AlertDialogTrigger asChild>
                      <ProjectWarningButton disabled={!mapping.servePort || loadingAppId === `stale-${mapping.servePort}`} type="button">
                        <Trash2 className={cn('size-4', loadingAppId === `stale-${mapping.servePort}` && 'animate-pulse')} />
                        Review stale link
                      </ProjectWarningButton>
                    </AlertDialogTrigger>
                  </DisabledAction>
                  <AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this stale private link?</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-400">
                        Project OS will remove the Tailscale Serve entry for HTTPS port {mapping.servePort ?? 'unknown'}. This should only affect the stale endpoint shown here:
                        {mapping.endpoint ? ` ${mapping.endpoint}` : ' unknown endpoint'}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="rounded-lg border border-orange-400/30 bg-orange-500/10 p-3 text-sm text-orange-100">
                      Active app links should be turned off from the app or private links section. This cleanup is only for links that no longer match an installed app.
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">Keep link</AlertDialogCancel>
                      <AlertDialogAction className="bg-orange-500 text-white hover:bg-orange-400" onClick={() => mapping.servePort && onRemoveStaleMapping(mapping.servePort)}>
                        Remove stale link
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </NetworkInset>
            ))}
        </NetworkPanel>
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
    <div className="overflow-hidden rounded-lg border border-sky-400/25">
      <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(180px,1.2fr)_minmax(180px,1.2fr)_120px_190px] gap-3 border-b border-sky-400/20 bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-normal text-sky-100/55 lg:grid">
        <span>App</span>
        <span>Local URL</span>
        <span>Private URL</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-sky-400/10">
        {privateAppAccess.map((access) => (
          <div className="grid gap-3 bg-slate-800 p-4 lg:grid-cols-[minmax(150px,1fr)_minmax(180px,1.2fr)_minmax(180px,1.2fr)_120px_190px] lg:items-center" key={access.app.appId}>
            <div className="min-w-0">
              <p className="m-0 truncate font-semibold text-slate-50">{access.app.appName}</p>
              {access.reconciliation && access.reconciliation.status !== 'healthy' && <p className="mt-1 line-clamp-2 text-xs text-orange-100">{access.reconciliation.detail}</p>}
            </div>
            <CompactUrl label="Local" value={access.localUrl || 'No local link yet'} />
            <CompactUrl label="Private" value={access.privateUrl || 'Connect Tailscale to create this link'} />
            <Badge className={cn('w-fit border', statusTone(access.status, 'badge'))} variant="outline">{access.statusLabel}</Badge>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {access.privateUrl ? (
                <ProjectOpenButton asChild size="sm">
                  <a href={access.privateUrl} rel="noreferrer" target="_blank">
                    <ExternalLink className="size-3.5" />
                    Open
                  </a>
                </ProjectOpenButton>
              ) : (
                <DisabledAction disabled reason="No private link exists yet. Connect Tailscale or repair private access first.">
                  <ProjectOpenButton disabled size="sm" type="button">
                    <ExternalLink className="size-3.5" />
                    Open
                  </ProjectOpenButton>
                </DisabledAction>
              )}
              <DisabledAction disabled={!access.privateUrl} reason="No private link exists yet. Connect Tailscale or repair private access first.">
                <ProjectDarkControlButton disabled={!access.privateUrl} onClick={() => onCopyPrivateLink(access.app.appId, access.privateUrl)} size="sm" type="button">
                  {copiedAppId === access.app.appId ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copiedAppId === access.app.appId ? 'Copied' : 'Copy'}
                </ProjectDarkControlButton>
              </DisabledAction>
              <DisabledAction disabled={loadingAppId === access.app.appId} reason="Wait for the current private access check to finish.">
                <ProjectDarkControlButton disabled={loadingAppId === access.app.appId} onClick={() => onRepairPrivateAccess(access.app)} size="sm" type="button">
                  <Wrench className={cn('size-3.5', loadingAppId === access.app.appId && 'animate-pulse')} />
                  Check
                </ProjectDarkControlButton>
              </DisabledAction>
              <DisabledAction disabled={loadingAppId === access.app.appId} reason="Wait for the current private access update to finish before turning this off.">
                <ProjectDarkControlButton aria-label={`Turn off private access for ${access.app.appName}`} className="p-0" disabled={loadingAppId === access.app.appId} onClick={() => onTurnOffPrivateAccess(access.app)} size="icon-sm" type="button">
                  <ShieldOff className={cn('size-3.5', loadingAppId === access.app.appId && 'animate-pulse')} />
                </ProjectDarkControlButton>
              </DisabledAction>
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
      <p className="m-0 text-xs font-bold uppercase tracking-normal text-sky-100/55 lg:hidden">{label}</p>
      <p className="m-0 truncate text-sm text-sky-100/75" title={value}>{value}</p>
    </div>
  );
}

function TailscaleSetupCard({ guidance, tasks }: { guidance: ReturnType<typeof tailscaleSetupGuidance>; tasks: ReturnType<typeof tailscaleSetupTasks> }) {
  const tone = guidance.tone === 'green'
    ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
    : guidance.tone === 'red'
      ? 'border-red-400/40 bg-red-500/10 text-red-200'
      : 'border-orange-400/45 bg-orange-500/10 text-orange-200';
  return (
    <div className={cn('rounded-lg border p-4', tone)}>
      <div className="flex items-start gap-3">
        {guidance.goodState ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <Lock className="mt-0.5 size-5 shrink-0" />}
        <div className="min-w-0">
          <p className="font-bold text-slate-50">{guidance.title}</p>
          <p className="mt-1 text-sm leading-6 text-current/80">{guidance.summary}</p>
          <p className="mt-1 text-xs leading-5 text-current/70">{guidance.action}</p>
          {!guidance.goodState && (
            <div className="mt-3 flex flex-wrap gap-2">
              <ProjectDarkControlButton asChild size="sm" type="button">
                <a href="https://login.tailscale.com/start" rel="noreferrer" target="_blank">
                  <ExternalLink className="size-3.5" />
                  Create or sign in
                </a>
              </ProjectDarkControlButton>
              <ProjectDarkControlButton asChild size="sm" type="button">
                <a href="https://tailscale.com/kb/1017/install" rel="noreferrer" target="_blank">
                  <ExternalLink className="size-3.5" />
                  Tailscale setup
                </a>
              </ProjectDarkControlButton>
            </div>
          )}
          <div className="mt-3 grid gap-2">
            {tasks.slice(0, guidance.goodState ? 3 : 1).map((task) => (
              <NetworkInset className="rounded-md px-3 py-2" key={task.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-50">{task.title}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase', task.status === 'ok' ? 'bg-emerald-500/15 text-emerald-100' : task.status === 'warning' ? 'bg-orange-500/15 text-orange-100' : 'bg-slate-700/70 text-slate-200')}>
                    {task.status === 'ok' ? 'Ready' : task.status === 'warning' ? 'To do' : 'Review'}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-current/70">{task.detail}</p>
              </NetworkInset>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
