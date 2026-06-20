import { Link } from 'react-router-dom';
import {
  Archive,
  BadgeAlert,
  ExternalLink,
  Filter,
  Loader2,
  MoreHorizontal,
  Play,
  Power,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  UploadCloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry, AppUpdateStatus } from '@/types/app';
import type { PrivateAccessReconciliationItem, PrivateAccessReconciliationReport } from '@/types/network';
import { AppIcon } from './ApplicationsPage.shared';
import { ApplicationsSetupGuide } from './ApplicationsSetupGuide';
import { ApplicationsUsageGuide } from './ApplicationsUsageGuide';
import { UninstallDialog } from './ApplicationsPageRemoveDialog';
import {
  accessLabel,
  appNotice,
  appPriority,
  displayStatus,
  formatTime,
  memoryUsed,
  privateLinkLabel,
  statusReason,
  telemetryValue,
  uptimeLabel,
} from './extensions/ApplicationsPage.logic';
import type { AppAction } from './extensions/ApplicationsPage.types';

type ApplicationsDashboardProps = {
  actionLoading: AppAction | 'uninstall' | 'update' | 'rollback' | null;
  apps: AppRuntimeView[];
  onAction: (appId: string, action: AppAction) => void;
  onManage: (appId: string) => void;
  onSearch: (value: string) => void;
  onSelect: (appId: string) => void;
  onUninstall: (appId: string) => void;
  onUpdate: (appId: string) => void;
  onRollback: (appId: string) => void;
  search: string;
  selectedId: string | null;
  summary: {
    installed: number;
    running: number;
    stopped: number;
    unhealthy: number;
  };
  accessByAppId: Record<string, AppAccessCheck>;
  telemetryByAppId: Record<string, AppTelemetry>;
  healthByAppId: Record<string, AppHealthSnapshot>;
  updatesByAppId: Record<string, AppUpdateStatus>;
  reconciliation: PrivateAccessReconciliationReport | null;
};

export function ApplicationsDashboard({ accessByAppId, actionLoading, apps, healthByAppId, onAction, onManage, onRollback, onSearch, onSelect, onUninstall, onUpdate, reconciliation, search, selectedId, summary, telemetryByAppId, updatesByAppId }: ApplicationsDashboardProps) {
  const { showAdvancedMetrics } = useProjectSettings();
  const reconciliationByAppId = new Map((reconciliation?.apps || []).map((item) => [item.appId, item]));
  const updateCount = Object.values(updatesByAppId).filter((update) => update.updateAvailable).length;
  const gridColumns = showAdvancedMetrics
    ? 'grid-cols-[minmax(220px,1.5fr)_120px_96px_140px_120px_150px]'
    : 'grid-cols-[minmax(220px,1.5fr)_120px_96px_140px_150px]';

  if (!showAdvancedMetrics) {
    return (
      <BasicApplicationsView
        accessByAppId={accessByAppId}
        actionLoading={actionLoading}
        apps={apps}
        healthByAppId={healthByAppId}
        onAction={onAction}
        onManage={onManage}
        onRollback={onRollback}
        onSearch={onSearch}
        onSelect={onSelect}
        onUninstall={onUninstall}
        onUpdate={onUpdate}
        reconciliation={reconciliation}
        search={search}
        selectedId={selectedId}
        summary={summary}
        telemetryByAppId={telemetryByAppId}
        updateCount={updateCount}
        updatesByAppId={updatesByAppId}
      />
    );
  }

  return (
    <Card className="overflow-hidden border-white/10 bg-slate-950/55 py-0 text-slate-100 shadow-po-panel">
      <CardHeader className="border-b border-white/10 p-0">
        <div className="flex border-b border-white/10 px-5 pt-5">
          <button className="border-b-2 border-violet-400 px-1 pb-3 text-sm font-semibold text-violet-200" type="button">Installed</button>
          <button className="ml-7 pb-3 text-sm font-medium text-slate-500" type="button">Available Updates <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{updateCount}</span></button>
          <button className="ml-7 pb-3 text-sm font-medium text-slate-500" type="button">Recently Removed</button>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-4">
          <SummaryTile icon={Archive} label="Installed" tone="blue" value={summary.installed} />
          <SummaryTile icon={Power} label="Running" tone="green" value={summary.running} />
          <SummaryTile icon={Square} label="Paused" tone="orange" value={summary.stopped} />
          <SummaryTile icon={ShieldCheck} label="Unhealthy" tone="red" value={summary.unhealthy} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
          <label className="relative block w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input className="h-9 border-slate-800 bg-slate-950/70 pl-9 text-sm text-slate-100 placeholder:text-slate-600" onChange={(event) => onSearch(event.target.value)} placeholder="Search installed applications..." type="search" value={search} />
          </label>
          <Button className="h-9 border-slate-800 bg-slate-950/70 text-slate-300 hover:bg-slate-900 hover:text-white" type="button" variant="outline">
            <Filter className="size-4" />
            Filter
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className={cn('grid border-b border-white/10 px-5 py-2 text-xs font-semibold text-slate-500', gridColumns)}>
          <span>Application</span>
          <span>Status</span>
          <span>CPU</span>
          <span>Memory</span>
          {showAdvancedMetrics && <span>Uptime</span>}
          <span className="text-right">Actions</span>
        </div>

        {apps.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">No apps match your search.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {apps.map((app) => {
              const telemetry = telemetryByAppId[app.appId] || app.telemetry;
              const access = accessByAppId[app.appId];
              const health = healthByAppId[app.appId] || app.healthSnapshot;
              const reconciliationItem = reconciliationByAppId.get(app.appId) || null;
              const update = updatesByAppId[app.appId] || null;
              const notice = appNotice(app, telemetry, access, health, reconciliationItem);
              const isSelected = selectedId === app.appId;
              return (
                <div key={app.appId}>
                  <button className={cn('grid w-full items-center px-5 py-3 text-left text-sm transition hover:bg-slate-900/75', gridColumns, isSelected && 'bg-violet-600/10')} onClick={() => onSelect(app.appId)} type="button">
                    <span className="flex min-w-0 items-center gap-3">
                      <AppIcon app={app} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">{app.appName}</span>
                        <span className="block truncate text-xs text-slate-500">{notice ? notice : appTypeLabel(app)}</span>
                      </span>
                    </span>
                    <StatusCell access={access} app={app} health={health} reconciliation={reconciliationItem} telemetry={telemetry} />
                    <span className="font-medium text-slate-300">{telemetryValue(telemetry?.cpuPercent)}</span>
                    <span className="font-medium text-slate-300">{memoryUsed(telemetry?.memoryUsage)}</span>
                    {showAdvancedMetrics && <span className="text-slate-400">{uptimeLabel(app)}</span>}
                    <span className="flex justify-end gap-1.5">
                      {app.accessUrl && <span className="grid size-7 place-items-center rounded-md border border-slate-800 bg-slate-950/70 text-slate-300"><ExternalLink className="size-3.5" /></span>}
                      <span className="grid size-7 place-items-center rounded-md border border-slate-800 bg-slate-950/70 text-slate-300"><Settings2 className="size-3.5" /></span>
                      <span className="grid size-7 place-items-center rounded-md border border-slate-800 bg-slate-950/70 text-slate-300"><MoreHorizontal className="size-3.5" /></span>
                    </span>
                  </button>

                  {isSelected && (
                    <div className="border-t border-violet-400/10 bg-slate-950/55 px-5 py-4">
                  <ExpandedAppManagement access={access} actionLoading={actionLoading} app={app} health={health} onAction={onAction} onManage={onManage} onRollback={onRollback} onUninstall={onUninstall} onUpdate={onUpdate} reconciliation={reconciliationItem} showAdvancedMetrics={showAdvancedMetrics} telemetry={telemetry} update={update} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BasicApplicationsView({ accessByAppId, actionLoading, apps, healthByAppId, onAction, onManage, onRollback, onSearch, onSelect, onUninstall, onUpdate, reconciliation, search, selectedId, summary, telemetryByAppId, updateCount, updatesByAppId }: ApplicationsDashboardProps & { updateCount: number }) {
  const reconciliationByAppId = new Map((reconciliation?.apps || []).map((item) => [item.appId, item]));
  const spotlight = selectSpotlightApp(apps, telemetryByAppId, accessByAppId, healthByAppId, reconciliationByAppId);

  return (
    <div className="grid gap-5">
      {spotlight && (
        <ApplicationSpotlight
          access={accessByAppId[spotlight.appId]}
          actionLoading={actionLoading}
          app={spotlight}
          health={healthByAppId[spotlight.appId] || spotlight.healthSnapshot}
          onAction={onAction}
          onManage={onManage}
          reconciliation={reconciliationByAppId.get(spotlight.appId) || null}
          telemetry={telemetryByAppId[spotlight.appId] || spotlight.telemetry}
        />
      )}

      <Card className="overflow-hidden border-white/10 bg-slate-950/45 py-0 text-slate-100 shadow-po-panel backdrop-blur-xl">
        <CardHeader className="border-b border-white/10 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h3 className="text-lg font-black text-white">Installed apps</h3>
              <p className="mt-1 text-sm text-slate-400">Open what you use, or manage an app when something needs attention.</p>
            </div>
            <div className="flex gap-2">
              <GlowCount label="Updates" value={updateCount} />
              <GlowCount label="Needs attention" value={summary.unhealthy} warning={summary.unhealthy > 0} />
            </div>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-4">
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
            <Button className="h-10 border-slate-800 bg-slate-950/60 text-slate-300 hover:bg-slate-900 hover:text-white" type="button" variant="outline">
              <Filter className="size-4" />
              Filter
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {apps.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-slate-950/45 px-5 py-10 text-center text-sm text-slate-500">No apps match your search.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {apps.map((app) => {
                const telemetry = telemetryByAppId[app.appId] || app.telemetry;
                const access = accessByAppId[app.appId];
                const health = healthByAppId[app.appId] || app.healthSnapshot;
                const reconciliationItem = reconciliationByAppId.get(app.appId) || null;
                const update = updatesByAppId[app.appId] || null;
                const isSelected = selectedId === app.appId;
                return (
                  <ApplicationCard
                    access={access}
                    actionLoading={actionLoading}
                    app={app}
                    health={health}
                    isSelected={isSelected}
                    key={app.appId}
                    onAction={onAction}
                    onManage={onManage}
                    onRollback={onRollback}
                    onSelect={onSelect}
                    onUninstall={onUninstall}
                    onUpdate={onUpdate}
                    reconciliation={reconciliationItem}
                    telemetry={telemetry}
                    update={update}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicationSpotlight({ access, actionLoading, app, health, onAction, onManage, reconciliation, telemetry }: Pick<AppActionProps, 'actionLoading' | 'onAction' | 'onManage'> & { access?: AppAccessCheck; app: AppRuntimeView; health?: AppHealthSnapshot | null; reconciliation?: PrivateAccessReconciliationItem | null; telemetry?: AppTelemetry | null }) {
  const status = displayStatus(app, health);
  const notice = appNotice(app, telemetry, access, health, reconciliation);
  const reason = statusReason(app, telemetry, access, health, reconciliation);
  const link = app.accessUrl || app.settings?.privateAccessUrl || app.settings?.accessUrl;
  const busy = Boolean(actionLoading);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-violet-300/18 bg-po-hero-app-spotlight p-5 shadow-po-brand-glow">
      <div className="absolute right-8 top-4 size-40 rounded-full bg-violet-400/10 blur-3xl" />
      <div className="relative z-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 gap-4">
          <AppIcon app={app} large />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-normal text-violet-200">App spotlight</p>
            <h3 className="mt-1 truncate text-2xl font-black text-white">{spotlightHeadline(app, status)}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{notice || reason || app.description}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <StatusPill status={status} />
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">{appTypeLabel(app)}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">Last backup {app.lastBackup || 'not recorded'}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {link && (
            <Button asChild className="bg-violet-500 text-white hover:bg-violet-400">
              <a href={link} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />
                Open
              </a>
            </Button>
          )}
          <Button className="border-violet-300/25 bg-violet-950/40 text-violet-100 hover:bg-violet-900/60" onClick={() => onManage(app.appId)} type="button" variant="outline">
            <Settings2 className="size-4" />
            Manage
          </Button>
          <Button className="border-slate-600/60 bg-slate-950/40 text-slate-100 hover:bg-slate-900" disabled={busy} onClick={() => onAction(app.appId, 'restart')} type="button" variant="outline">
            {actionLoading === 'restart' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            Restart
          </Button>
        </div>
      </div>
    </section>
  );
}

function ApplicationCard({ access, actionLoading, app, health, isSelected, onAction, onManage, onRollback, onSelect, onUninstall, onUpdate, reconciliation, telemetry, update }: AppActionProps & { access?: AppAccessCheck; health?: AppHealthSnapshot | null; isSelected: boolean; reconciliation?: PrivateAccessReconciliationItem | null; telemetry?: AppTelemetry | null; update?: AppUpdateStatus | null; onSelect: (appId: string) => void }) {
  const status = displayStatus(app, health);
  const notice = appNotice(app, telemetry, access, health, reconciliation);
  const reason = statusReason(app, telemetry, access, health, reconciliation);
  const link = app.accessUrl || app.settings?.privateAccessUrl || app.settings?.accessUrl;
  const busy = Boolean(actionLoading);

  return (
    <article className={cn('grid gap-4 rounded-xl border bg-slate-950/48 p-4 shadow-po-card transition', isSelected ? 'border-violet-300/45 bg-violet-950/20' : 'border-white/10 hover:border-violet-300/30 hover:bg-slate-900/55')}>
      <div className="flex gap-3">
        <AppIcon app={app} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-white">{app.appName}</h3>
              <p className="mt-1 truncate text-sm text-slate-400">{appTypeLabel(app)}</p>
            </div>
            <StatusPill status={status} />
          </div>
          <p className={cn('mt-3 line-clamp-2 min-h-10 text-sm leading-5', notice ? 'text-amber-100' : 'text-slate-300')}>{notice || app.description || reason}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="App link" value={accessLabel(access)} />
        <MiniMetric label="Memory" value={memoryUsed(telemetry?.memoryUsage)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {link ? (
          <Button asChild className="bg-violet-600 text-white hover:bg-violet-500" size="sm">
            <a href={link} rel="noreferrer" target="_blank">
              <ExternalLink className="size-4" />
              Open
            </a>
          </Button>
        ) : (
          <Button className="bg-slate-800 text-slate-300 hover:bg-slate-700" disabled size="sm" type="button">
            <ExternalLink className="size-4" />
            No link yet
          </Button>
        )}
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onManage(app.appId)} size="sm" type="button" variant="outline">
          <Settings2 className="size-4" />
          Manage
        </Button>
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={busy} onClick={() => onAction(app.appId, 'restart')} size="sm" type="button" variant="outline">
          {actionLoading === 'restart' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
          Restart
        </Button>
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onSelect(app.appId)} size="icon" type="button" variant="outline">
          <MoreHorizontal className="size-4" />
        </Button>
      </div>

      {isSelected && (
        <div className="border-t border-violet-300/15 pt-4">
          <ExpandedAppManagement access={access} actionLoading={actionLoading} app={app} health={health} onAction={onAction} onManage={onManage} onRollback={onRollback} onUninstall={onUninstall} onUpdate={onUpdate} reconciliation={reconciliation} showAdvancedMetrics={false} telemetry={telemetry} update={update} />
        </div>
      )}
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

function selectSpotlightApp(apps: AppRuntimeView[], telemetryByAppId: Record<string, AppTelemetry>, accessByAppId: Record<string, AppAccessCheck>, healthByAppId: Record<string, AppHealthSnapshot>, reconciliationByAppId: Map<string, PrivateAccessReconciliationItem>) {
  if (!apps.length) {
    return null;
  }
  const attentionApp = [...apps]
    .sort((left, right) => appPriority(left, telemetryByAppId[left.appId], accessByAppId[left.appId], healthByAppId[left.appId] || left.healthSnapshot) - appPriority(right, telemetryByAppId[right.appId], accessByAppId[right.appId], healthByAppId[right.appId] || right.healthSnapshot))
    .find((app) => {
      const priority = appPriority(app, telemetryByAppId[app.appId], accessByAppId[app.appId], healthByAppId[app.appId] || app.healthSnapshot);
      const reconciliation = reconciliationByAppId.get(app.appId);
      return priority <= 2 || Boolean(reconciliation && !['healthy', 'waiting'].includes(reconciliation.status));
    });
  if (attentionApp) {
    return attentionApp;
  }
  const recentPrivateApp = [...apps]
    .filter((app) => app.settings?.tailscaleEnabled || app.desiredAccess?.privateAccessRecommended || app.desiredAccess?.privateAccessRequired)
    .sort((left, right) => new Date(right.installedAt).getTime() - new Date(left.installedAt).getTime())[0];
  if (recentPrivateApp) {
    return recentPrivateApp;
  }
  return [...apps].sort((left, right) => new Date(right.installedAt).getTime() - new Date(left.installedAt).getTime())[0];
}

function spotlightHeadline(app: AppRuntimeView, status: string) {
  if (status === 'Needs attention' || status === 'Unavailable') {
    return `${app.appName} needs attention`;
  }
  if (status === 'Starting') {
    return `${app.appName} is starting`;
  }
  if (status === 'Paused') {
    return `${app.appName} is paused`;
  }
  if (app.settings?.tailscaleEnabled || app.desiredAccess?.privateAccessRecommended || app.desiredAccess?.privateAccessRequired) {
    return `${app.appName} is available privately`;
  }
  return `${app.appName} is ready`;
}

export function EmptyState() {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-lg border border-white/10 bg-slate-900/50 p-8 text-center shadow-po-panel">
      <div className="max-w-md">
        <div className="mx-auto grid size-14 place-items-center rounded-lg bg-violet-600/20 text-violet-200">
          <Archive className="size-7" />
        </div>
        <h3 className="mt-5 text-2xl font-bold text-white">No apps yet</h3>
        <p className="mt-2 text-slate-400">Choose an app from the Marketplace and it will show up here with quick actions, status, and settings.</p>
        <Button asChild className="mt-5 bg-violet-600 text-white hover:bg-violet-500">
          <Link to="/marketplace">Browse apps</Link>
        </Button>
      </div>
    </div>
  );
}

function ExpandedAppManagement({ access, app, actionLoading, health, onAction, onManage, onRollback, onUninstall, onUpdate, reconciliation, showAdvancedMetrics, telemetry, update }: AppActionProps & { access?: AppAccessCheck; health?: AppHealthSnapshot | null; reconciliation?: PrivateAccessReconciliationItem | null; showAdvancedMetrics: boolean; telemetry?: AppTelemetry | null; update?: AppUpdateStatus | null }) {
  const busy = Boolean(actionLoading);
  const notice = appNotice(app, telemetry, access, health, reconciliation);
  const usageGuide = app.usageGuide?.kind !== 'web-app' ? app.usageGuide : null;
  const status = displayStatus(app, health);
  const repairSuggested = status === 'Needs attention' || status === 'Unavailable';
  return (
    <div className="grid gap-4">
      {notice && <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{notice}</div>}
      {update?.updateAvailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
          <span>{update.appName} has a trusted catalog update. Project OS will verify a backup before redeploying.</span>
          <Button className="bg-sky-500 text-slate-950 hover:bg-sky-400" disabled={busy} onClick={() => onUpdate(app.appId)} size="sm" type="button">
            {actionLoading === 'update' ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            Update
          </Button>
        </div>
      )}
      {usageGuide && <ApplicationsUsageGuide guide={usageGuide} />}
      {hasSetupGuide(app) && app.setupGuide && <ApplicationsSetupGuide guide={app.setupGuide} />}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniMetric label="CPU" value={telemetryValue(telemetry?.cpuPercent)} />
          <MiniMetric label="Memory" value={telemetryValue(telemetry?.memoryUsage)} />
          <MiniMetric label="App link" value={accessLabel(access)} />
          <MiniMetric label="Access" value={privateLinkLabel(app, reconciliation)} />
          {showAdvancedMetrics && <MiniMetric label="Health" value={health?.message || status} />}
          {showAdvancedMetrics && <MiniMetric label="Last checked" value={formatTime(health?.checkedAt || telemetry?.checkedAt)} />}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {repairSuggested && (
            <Button className="bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={busy} onClick={() => onAction(app.appId, 'repair')} size="sm" type="button">
              {actionLoading === 'repair' ? <Loader2 className="size-4 animate-spin" /> : <BadgeAlert className="size-4" />}
              Try to fix
            </Button>
          )}
          {app.accessUrl && (
            <Button asChild className="bg-violet-600 text-white hover:bg-violet-500" size="sm">
              <a href={app.accessUrl} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />
                {app.usageGuide?.openUrlLabel || 'Open'}
              </a>
            </Button>
          )}
          <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={busy} onClick={() => onAction(app.appId, status === 'Paused' ? 'start' : 'stop')} size="sm" type="button" variant="outline">
            {status === 'Paused' ? <Play className="size-4" /> : <Square className="size-4" />}
            {status === 'Paused' ? 'Start' : 'Pause'}
          </Button>
          <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={busy} onClick={() => onAction(app.appId, 'restart')} size="sm" type="button" variant="outline">
            {actionLoading === 'restart' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            Restart
          </Button>
          <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
            <Link to="/network">Manage access</Link>
          </Button>
          <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
            <Link to="/backups">Backups</Link>
          </Button>
          {update?.rollbackAvailable && (
            <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={busy} onClick={() => onRollback(app.appId)} size="sm" type="button" variant="outline">
              {actionLoading === 'rollback' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
              Roll back
            </Button>
          )}
          <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onManage(app.appId)} size="sm" type="button" variant="outline">
            <Settings2 className="size-4" />
            Manage
          </Button>
          <UninstallDialog app={app} disabled={busy} iconOnly onUninstall={onUninstall} />
        </div>
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

type AppActionProps = {
  app: AppRuntimeView;
  actionLoading: AppAction | 'uninstall' | 'update' | 'rollback' | null;
  onAction: (appId: string, action: AppAction) => void;
  onManage: (appId: string) => void;
  onUpdate: (appId: string) => void;
  onRollback: (appId: string) => void;
  onUninstall: (appId: string) => void;
};

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

function StatusCell({ access, app, health, reconciliation, telemetry }: { access?: AppAccessCheck; app: AppRuntimeView; health?: AppHealthSnapshot | null; reconciliation?: PrivateAccessReconciliationItem | null; telemetry?: AppTelemetry | null }) {
  const status = displayStatus(app, health);
  const reason = statusReason(app, telemetry, access, health, reconciliation);
  return (
    <span className="grid gap-0.5">
      <StatusPill status={status} />
      <span className="truncate text-xs text-slate-500">{reason}</span>
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const isRunning = status === 'Ready';
  const isStopped = status === 'Paused';
  const isUnavailable = status === 'Unavailable' || status === 'Needs attention';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', isRunning && 'text-emerald-300', isStopped && 'text-slate-300', isUnavailable && 'text-red-300', !isRunning && !isStopped && !isUnavailable && 'text-amber-300')}>
      <span className={cn('size-2 rounded-full', isRunning && 'bg-emerald-400', isStopped && 'bg-slate-400', isUnavailable && 'bg-red-400', !isRunning && !isStopped && !isUnavailable && 'bg-amber-300')} />
      {status}
    </span>
  );
}

function hasSetupGuide(app: AppRuntimeView) {
  const guide = app.setupGuide;
  if (!guide) {
    return false;
  }
  return guide.generatedValues.length > 0
    || guide.copyableFields.length > 0
    || guide.qrFields.length > 0
    || guide.integrations.length > 0
    || guide.userSteps.length > 0
    || guide.automationCapabilities.length > 0;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/55 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
