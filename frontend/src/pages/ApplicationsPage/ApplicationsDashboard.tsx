import { Link } from 'react-router-dom';
import {
  Archive,
  BadgeAlert,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pin,
  Play,
  Power,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry, AppUpdateStatus } from '@/types/app';
import type { AppOwnershipView } from '@/types/appOwnership';
import type { PrivateAccessReconciliationItem, PrivateAccessReconciliationReport } from '@/types/network';
import type { ObservedServiceView } from '@/types/observedService';
import { AppIcon } from './ApplicationsPage.shared';
import { ObservedServicesPanel } from './ObservedServicesPanel';
import { appCardPrimaryUrl } from './extensions/ApplicationsPage.cardModel';
import {
  appNotice,
  displayStatus,
  memoryUsed,
  privateLinkLabel,
  statusReason,
  telemetryValue,
} from './extensions/ApplicationsPage.logic';
import { appRemediationDisplay, shouldShowRemediation } from './extensions/ApplicationsPage.remediation';
import type { AppAction } from './extensions/ApplicationsPage.types';

type AppBusyAction = AppAction | 'update' | 'rollback';

type ApplicationsDashboardProps = {
  actionLoadingByAppId: Record<string, AppBusyAction | null | undefined>;
  apps: AppRuntimeView[];
  onAction: (appId: string, action: AppAction) => void;
  onManage: (appId: string) => void;
  onSearch: (value: string) => void;
  onUpdate: (appId: string) => void;
  search: string;
  summary: {
    installed: number;
    running: number;
    stopped: number;
    unhealthy: number;
  };
  accessByAppId: Record<string, AppAccessCheck>;
  telemetryByAppId: Record<string, AppTelemetry>;
  healthByAppId: Record<string, AppHealthSnapshot>;
  observedServices: ObservedServiceView[];
  onReviewService: (id: string) => void;
  pinnedApps: AppOwnershipView[];
  updatesByAppId: Record<string, AppUpdateStatus>;
  reconciliation: PrivateAccessReconciliationReport | null;
  uninstallingAppIds: Set<string>;
};

type AppRenderContext = {
  access?: AppAccessCheck;
  actionLoading?: AppBusyAction | null;
  app: AppRuntimeView;
  health?: AppHealthSnapshot | null;
  reconciliation?: PrivateAccessReconciliationItem | null;
  telemetry?: AppTelemetry | null;
  uninstalling: boolean;
  update?: AppUpdateStatus | null;
};

type NextAction = {
  label: 'Open' | 'Review restore' | 'Repair' | 'Start' | 'Review' | 'Uninstalling...';
  disabled?: boolean;
  href?: string | null;
  action?: AppAction;
  manage?: boolean;
};

export function ApplicationsDashboard({
  accessByAppId,
  actionLoadingByAppId,
  apps,
  healthByAppId,
  observedServices,
  onAction,
  onManage,
  onReviewService,
  onSearch,
  onUpdate,
  pinnedApps,
  reconciliation,
  search,
  summary,
  telemetryByAppId,
  uninstallingAppIds,
  updatesByAppId,
}: ApplicationsDashboardProps) {
  const { showAdvancedMetrics } = useProjectSettings();
  const reconciliationByAppId = new Map((reconciliation?.apps || []).map((item) => [item.appId, item]));
  const updateCount = Object.values(updatesByAppId).filter((update) => update.updateAvailable).length;
  const nonManagedObservedServices = observedServices.filter((service) => isSecondaryObservedService(service));

  const appContexts = apps.map((app) => ({
    access: accessByAppId[app.appId],
    actionLoading: actionLoadingByAppId[app.appId],
    app,
    health: healthByAppId[app.appId] || app.healthSnapshot,
    reconciliation: reconciliationByAppId.get(app.appId) || null,
    telemetry: telemetryByAppId[app.appId] || app.telemetry,
    uninstalling: uninstallingAppIds.has(app.appId),
    update: updatesByAppId[app.appId] || null,
  }));

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden border-white/10 bg-slate-950/45 py-0 text-slate-100 shadow-po-panel backdrop-blur-xl">
        <CardHeader className="border-b border-white/10 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h3 className="text-lg font-black text-white">Installed apps</h3>
              <p className="mt-1 text-sm text-slate-400">
                {showAdvancedMetrics
                  ? 'Operations view with direct runtime controls and app details in the drawer.'
                  : 'Open what is ready. Use Manage for repair, backup, access, and removal.'}
              </p>
            </div>
            <div className="flex gap-2">
              <GlowCount label="Updates" value={updateCount} />
              <GlowCount label="Needs attention" value={summary.unhealthy} warning={summary.unhealthy > 0} />
            </div>
          </div>

          <div className="hidden gap-3 p-5 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile icon={Archive} label="Installed" tone="blue" value={summary.installed} />
            <SummaryTile icon={Power} label="Running" tone="green" value={summary.running} />
            <SummaryTile icon={Square} label="Paused" tone="orange" value={summary.stopped} />
            <SummaryTile icon={ShieldCheck} label="Needs attention" tone="red" value={summary.unhealthy} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
            <label className="relative block w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input className="h-10 border-slate-800 bg-slate-950/60 pl-9 text-sm text-slate-100 placeholder:text-slate-600" onChange={(event) => onSearch(event.target.value)} placeholder="Search your apps..." type="search" value={search} />
            </label>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {apps.length === 0 && pinnedApps.length === 0 && nonManagedObservedServices.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-slate-950/45 px-5 py-10 text-center text-sm text-slate-500">No apps match your search.</div>
          ) : showAdvancedMetrics ? (
            <OperationsTable contexts={appContexts} onAction={onAction} onManage={onManage} onUpdate={onUpdate} />
          ) : (
            <div className="grid gap-6">
              {(apps.length > 0 || pinnedApps.length > 0) && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {appContexts.map((context) => (
                    <ApplicationCard context={context} key={context.app.appId} onAction={onAction} onManage={onManage} />
                  ))}
                  {pinnedApps.map((app) => (
                    <PinnedExternalCard app={app} key={app.observedService?.id || app.catalogAppId} onReviewService={onReviewService} />
                  ))}
                </div>
              )}
              <ObservedServicesPanel items={nonManagedObservedServices} onReviewService={onReviewService} />
            </div>
          )}
        </CardContent>
      </Card>

      {showAdvancedMetrics && pinnedApps.length > 0 && (
        <section className="grid gap-3">
          <div>
            <h4 className="text-sm font-black uppercase tracking-normal text-sky-300">Pinned external services</h4>
            <p className="mt-1 text-sm text-slate-500">Saved services Project OS opens and checks but does not manage.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pinnedApps.map((app) => <PinnedExternalCard app={app} key={app.observedService?.id || app.catalogAppId} onReviewService={onReviewService} />)}
          </div>
        </section>
      )}
      {showAdvancedMetrics && <ObservedServicesPanel items={nonManagedObservedServices} onReviewService={onReviewService} />}
    </div>
  );
}

function OperationsTable({ contexts, onAction, onManage, onUpdate }: { contexts: AppRenderContext[]; onAction: (appId: string, action: AppAction) => void; onManage: (appId: string) => void; onUpdate: (appId: string) => void }) {
  if (!contexts.length) {
    return <div className="rounded-lg border border-white/10 bg-slate-950/45 px-5 py-10 text-center text-sm text-slate-500">No apps match your search.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/10 hover:bg-transparent">
          <TableHead className="text-slate-400">App</TableHead>
          <TableHead className="text-slate-400">State</TableHead>
          <TableHead className="text-slate-400">Access</TableHead>
          <TableHead className="text-slate-400">Backup</TableHead>
          <TableHead className="text-slate-400">Next action</TableHead>
          <TableHead className="text-right text-slate-400">Controls</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contexts.map((context) => {
          const { app } = context;
          const nextAction = nextActionForApp(context);
          return (
            <TableRow className="cursor-pointer border-white/10 hover:bg-slate-900/75" key={app.appId} onClick={() => onManage(app.appId)}>
              <TableCell>
                <span className="flex min-w-0 items-center gap-3">
                  <AppIcon app={app} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">{app.appName}</span>
                    <span className="block truncate text-xs text-slate-500">{appTypeLabel(app)}</span>
                  </span>
                </span>
              </TableCell>
              <TableCell>
                <StatusPill status={context.uninstalling ? 'Uninstalling' : displayStatus(app, context.health)} />
              </TableCell>
              <TableCell className="max-w-40 truncate text-slate-300">{privateLinkLabel(app, context.reconciliation)}</TableCell>
              <TableCell className="max-w-40 truncate text-slate-300">{app.lastBackup || 'Not configured'}</TableCell>
              <TableCell>
                <NextActionButton context={context} nextAction={nextAction} onAction={onAction} onManage={onManage} />
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                  {app.accessUrl && (
                    <Button asChild size="icon-sm" variant="outline">
                      <a aria-label={`Open ${app.appName}`} href={app.accessUrl} rel="noreferrer" target="_blank">
                        <ExternalLink />
                      </a>
                    </Button>
                  )}
                  <RuntimeButton context={context} onAction={onAction} />
                  <DisabledAction disabled={Boolean(context.actionLoading || context.uninstalling)} reason="Wait for the current app action to finish before restarting.">
                    <Button disabled={Boolean(context.actionLoading || context.uninstalling)} onClick={() => onAction(app.appId, 'restart')} size="icon-sm" type="button" variant="outline">
                      <RefreshCcw className={cn(context.actionLoading === 'restart' && 'animate-spin')} />
                      <span className="sr-only">Restart {app.appName}</span>
                    </Button>
                  </DisabledAction>
                  {context.update?.updateAvailable && (
                    <DisabledAction disabled={Boolean(context.actionLoading || context.uninstalling)} reason="Wait for the current app action to finish before updating.">
                      <Button disabled={Boolean(context.actionLoading || context.uninstalling)} onClick={() => onUpdate(app.appId)} size="sm" type="button" variant="outline">Update</Button>
                    </DisabledAction>
                  )}
                  <Button onClick={() => onManage(app.appId)} size="sm" type="button" variant="outline">
                    <Settings2 data-icon="inline-start" />
                    Manage
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ApplicationCard({ context, onAction, onManage }: { context: AppRenderContext; onAction: (appId: string, action: AppAction) => void; onManage: (appId: string) => void }) {
  const { access, app, health, reconciliation, telemetry, uninstalling } = context;
  const status = displayStatus(app, health);
  const notice = appNotice(app, telemetry, access, health, reconciliation);
  const reason = statusReason(app, telemetry, access, health, reconciliation);
  const remediation = appRemediationDisplay({ app, health });
  const showRemediation = shouldShowRemediation(remediation);
  const nextAction = nextActionForApp(context);

  return (
    <article className="grid gap-4 rounded-lg border border-white/10 bg-slate-950/55 p-4 shadow-po-card transition hover:border-violet-300/30 hover:bg-slate-900/55" onClick={() => onManage(app.appId)}>
      <button className="flex gap-3 text-left" onClick={() => onManage(app.appId)} type="button">
        <AppIcon app={app} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-white">{app.appName}</h3>
              <p className="mt-1 truncate text-sm text-slate-400">{appTypeLabel(app)}</p>
            </div>
            <StatusPill status={uninstalling ? 'Uninstalling' : status} />
          </div>
          <p className={cn('mt-3 line-clamp-2 min-h-10 text-sm leading-5', notice || uninstalling ? 'text-amber-100' : 'text-slate-300')}>
            {uninstalling ? 'Uninstalling... Project OS is removing this app safely.' : notice || app.description || reason}
          </p>
        </div>
      </button>

      {showRemediation && !uninstalling && (
        <div className={cn(
          'rounded-lg border px-3 py-2',
          remediation.tone === 'critical' ? 'border-red-300/25 bg-red-500/10 text-red-100' : 'border-amber-300/25 bg-amber-500/10 text-amber-100'
        )}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-black uppercase tracking-normal">{remediation.label}</span>
            <span className="shrink-0 text-xs font-semibold opacity-85">{remediation.nextActionLabel}</span>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-200">{remediation.summary}</p>
        </div>
      )}

      <button className="grid grid-cols-2 gap-2 text-left" onClick={() => onManage(app.appId)} type="button">
        <MiniMetric label="Access" value={accessSummary(app, access)} />
        <MiniMetric label="Backup" value={app.lastBackup || 'Not configured'} />
      </button>

      <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
        <NextActionButton context={context} nextAction={nextAction} onAction={onAction} onManage={onManage} />
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onManage(app.appId)} size="sm" type="button" variant="outline">
          <Settings2 data-icon="inline-start" />
          Manage
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`More actions for ${app.appName}`} className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="icon-sm" type="button" variant="outline">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => onManage(app.appId)}>
                <Settings2 />
                Manage app
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}

function NextActionButton({ context, nextAction, onAction, onManage }: { context: AppRenderContext; nextAction: NextAction; onAction: (appId: string, action: AppAction) => void; onManage: (appId: string) => void }) {
  const { app, actionLoading, uninstalling } = context;
  const disabled = Boolean(nextAction.disabled || actionLoading || uninstalling);

  if (nextAction.href) {
    return (
      <Button asChild className="bg-violet-600 text-white hover:bg-violet-500" size="sm">
        <a href={nextAction.href} rel="noreferrer" target="_blank">
          <ExternalLink data-icon="inline-start" />
          {nextAction.label}
        </a>
      </Button>
    );
  }

  if (nextAction.action) {
    return (
      <DisabledAction disabled={disabled} reason="Wait for the current app action to finish.">
        <Button className="bg-violet-600 text-white hover:bg-violet-500" disabled={disabled} onClick={() => onAction(app.appId, nextAction.action!)} size="sm" type="button">
          {actionLoading === nextAction.action || uninstalling ? <Loader2 className="animate-spin" data-icon="inline-start" /> : actionIcon(nextAction.label)}
          {nextAction.label}
        </Button>
      </DisabledAction>
    );
  }

  return (
    <Button className="bg-violet-600 text-white hover:bg-violet-500" disabled={disabled} onClick={() => onManage(app.appId)} size="sm" type="button">
      {uninstalling ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Settings2 data-icon="inline-start" />}
      {nextAction.label}
    </Button>
  );
}

function actionIcon(label: NextAction['label']) {
  if (label === 'Repair') {
    return <BadgeAlert data-icon="inline-start" />;
  }
  if (label === 'Start') {
    return <Play data-icon="inline-start" />;
  }
  return <Settings2 data-icon="inline-start" />;
}

function RuntimeButton({ context, onAction }: { context: AppRenderContext; onAction: (appId: string, action: AppAction) => void }) {
  const { actionLoading, app, health, uninstalling } = context;
  const status = displayStatus(app, health);
  const action = status === 'Paused' ? 'start' : 'stop';
  const disabled = Boolean(actionLoading || uninstalling);

  return (
    <DisabledAction disabled={disabled} reason="Wait for the current app action to finish before changing runtime state.">
      <Button disabled={disabled} onClick={() => onAction(app.appId, action)} size="icon-sm" type="button" variant="outline">
        {actionLoading === action ? <Loader2 className="animate-spin" /> : action === 'start' ? <Play /> : <Square />}
        <span className="sr-only">{action === 'start' ? 'Start' : 'Pause'} {app.appName}</span>
      </Button>
    </DisabledAction>
  );
}

function nextActionForApp(context: AppRenderContext): NextAction {
  const { app, health, uninstalling } = context;
  if (uninstalling) {
    return { label: 'Uninstalling...', disabled: true, manage: true };
  }

  const remediation = appRemediationDisplay({ app, health });
  if (remediation?.state === 'restore_recommended') {
    return { label: 'Review restore', manage: true };
  }

  const status = displayStatus(app, health);
  if (status === 'Paused') {
    return { label: 'Start', action: 'start' };
  }
  if (shouldShowRemediation(remediation) || status === 'Needs attention' || status === 'Unavailable') {
    if (repairAvailable(health)) {
      return { label: 'Repair', action: 'repair' };
    }
    return { label: 'Review', manage: true };
  }

  const href = appCardPrimaryUrl(app);
  if (href) {
    return { label: 'Open', href };
  }
  return { label: 'Review', manage: true };
}

function repairAvailable(health?: AppHealthSnapshot | null) {
  return Boolean((health as (AppHealthSnapshot & { repairAvailable?: boolean }) | null | undefined)?.repairAvailable);
}

function isSecondaryObservedService(service: ObservedServiceView) {
  return !service.managedByThisProjectOs
    && service.ownershipState !== 'owned_managed'
    && service.userStatus !== 'installed_managed'
    && !service.pinned
    && service.userStatus !== 'pinned_external';
}

function PinnedExternalCard({ app, onReviewService }: { app: AppOwnershipView; onReviewService: (id: string) => void }) {
  const service = app.observedService;
  const openHref = service?.url || app.primaryAction?.href || null;
  return (
    <article className="grid gap-4 rounded-lg border border-sky-300/25 bg-sky-500/10 p-4 shadow-po-card transition hover:border-sky-300/40 hover:bg-sky-500/15">
      <button className="flex gap-3 text-left" onClick={() => service && onReviewService(service.id)} type="button">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-sky-300/20 bg-sky-500/15 text-sky-100">
          <Pin className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-white">{app.name}</h3>
              <p className="mt-1 truncate text-sm text-sky-100/75">{app.category || 'Pinned external service'}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-200">
              <span className="size-2 rounded-full bg-sky-300" />
              Pinned
            </span>
          </div>
          <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-300">
            Project OS can open and check this service, but it does not own the runtime.
          </p>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="Access" value={service?.accessScope || 'External'} />
        <MiniMetric label="Runtime" value={service?.runtimeState || 'Observed'} />
      </div>

      <div className="flex flex-wrap gap-2">
        {openHref ? (
          <Button asChild className="bg-sky-500 text-slate-950 hover:bg-sky-400" size="sm">
            <a href={openHref} rel="noreferrer" target="_blank">
              <ExternalLink data-icon="inline-start" />
              Open
            </a>
          </Button>
        ) : (
          <DisabledAction disabled reason="This pinned service does not have an openable link yet.">
            <Button className="bg-slate-800 text-slate-300 hover:bg-slate-700" disabled size="sm" type="button">
              <ExternalLink data-icon="inline-start" />
              No link yet
            </Button>
          </DisabledAction>
        )}
        <DisabledAction disabled={!service} reason="Project OS has not matched this pinned service to an observed service yet.">
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={!service} onClick={() => service && onReviewService(service.id)} size="sm" type="button" variant="outline">
            <Settings2 data-icon="inline-start" />
            Review
          </Button>
        </DisabledAction>
      </div>
    </article>
  );
}

function GlowCount({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold', warning ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-violet-300/20 bg-violet-500/10 text-violet-100')}>
      <span className="text-sm font-black">{value}</span>
      {label}
    </span>
  );
}

function accessSummary(app: AppRuntimeView, access?: AppAccessCheck) {
  if (app.canonicalAccessState === 'private_ready') {
    return 'Private link ready';
  }
  if (app.canonicalAccessState === 'local_ready') {
    return 'Local link ready';
  }
  if (access?.status === 'reachable') {
    return 'Responding';
  }
  if (access?.status === 'unreachable') {
    return 'Not responding';
  }
  return 'Not ready';
}

export function EmptyState() {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-lg border border-white/10 bg-slate-900/50 p-8 text-center shadow-po-panel">
      <div className="max-w-md">
        <div className="mx-auto grid size-14 place-items-center rounded-lg bg-violet-600/20 text-violet-200">
          <Archive className="size-7" />
        </div>
        <h3 className="mt-5 text-2xl font-bold text-white">No apps yet</h3>
        <p className="mt-2 text-slate-400">Choose an app from Discover and it will show up here with quick actions, status, and settings.</p>
        <Button asChild className="mt-5 bg-violet-600 text-white hover:bg-violet-500">
          <Link to="/discover">Browse apps</Link>
        </Button>
      </div>
    </div>
  );
}

function appTypeLabel(app: AppRuntimeView) {
  const kind = app.usageGuide?.kind;
  if (kind === 'companion-service') {
    return `${app.category} companion service`;
  }
  if (kind === 'admin-service') {
    return `${app.category} setup service`;
  }
  if (kind === 'background-service' || kind === 'infrastructure') {
    return `${app.category} service`;
  }
  return app.category;
}

function SummaryTile({ icon: Icon, label, tone, value }: { icon: LucideIcon; label: string; tone: 'blue' | 'green' | 'orange' | 'red'; value: number }) {
  const tones = {
    blue: 'text-sky-300 bg-sky-500/10',
    green: 'text-emerald-300 bg-emerald-500/10',
    orange: 'text-orange-300 bg-orange-500/10',
    red: 'text-red-300 bg-red-500/10',
  };
  return (
    <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-slate-900/60 p-4">
      <span className={cn('grid size-10 place-items-center rounded-lg', tones[tone])}>
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-2xl font-bold text-white">{value}</span>
        <span className="text-xs text-slate-500">{label}</span>
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const isRunning = status === 'Ready';
  const isStopped = status === 'Paused';
  const isUninstalling = status === 'Uninstalling';
  const isUnavailable = status === 'Unavailable' || status === 'Needs attention';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', isRunning && 'text-emerald-300', isStopped && 'text-slate-300', isUninstalling && 'text-sky-300', isUnavailable && 'text-red-300', !isRunning && !isStopped && !isUninstalling && !isUnavailable && 'text-amber-300')}>
      <span className={cn('size-2 rounded-full', isRunning && 'bg-emerald-400', isStopped && 'bg-slate-400', isUninstalling && 'animate-pulse bg-sky-300', isUnavailable && 'bg-red-400', !isRunning && !isStopped && !isUninstalling && !isUnavailable && 'bg-amber-300')} />
      {status}
    </span>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/55 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
