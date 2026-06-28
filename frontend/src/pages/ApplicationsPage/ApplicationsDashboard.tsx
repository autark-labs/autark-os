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
  UploadCloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry, AppUpdateStatus } from '@/types/app';
import type { AppOwnershipView } from '@/types/appOwnership';
import type { PrivateAccessReconciliationItem, PrivateAccessReconciliationReport } from '@/types/network';
import type { ObservedServiceView } from '@/types/observedService';
import { AppIcon } from './ApplicationsPage.shared';
import { ApplicationsSetupGuide } from './ApplicationsSetupGuide';
import { ApplicationsUsageGuide } from './ApplicationsUsageGuide';
import { UninstallDialog } from './ApplicationsPageRemoveDialog';
import { ObservedServicesPanel } from './ObservedServicesPanel';
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
import { appCardPrimaryUrl } from './extensions/ApplicationsPage.cardModel';
import { appRemediationDisplay, shouldShowRemediation } from './extensions/ApplicationsPage.remediation';
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
  observedServices: ObservedServiceView[];
  onReviewService: (id: string) => void;
  pinnedApps: AppOwnershipView[];
  updatesByAppId: Record<string, AppUpdateStatus>;
  reconciliation: PrivateAccessReconciliationReport | null;
};

export function ApplicationsDashboard({ accessByAppId, actionLoading, apps, healthByAppId, observedServices, onAction, onManage, onReviewService, onRollback, onSearch, onSelect, onUninstall, onUpdate, pinnedApps, reconciliation, search, selectedId, summary, telemetryByAppId, updatesByAppId }: ApplicationsDashboardProps) {
  const { showAdvancedMetrics } = useProjectSettings();
  const reconciliationByAppId = new Map((reconciliation?.apps || []).map((item) => [item.appId, item]));
  const updateCount = Object.values(updatesByAppId).filter((update) => update.updateAvailable).length;
  const nonManagedObservedServices = observedServices.filter((service) => isSecondaryObservedService(service));
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
        observedServices={observedServices}
        onReviewService={onReviewService}
        onRollback={onRollback}
        onSearch={onSearch}
        onSelect={onSelect}
        onUninstall={onUninstall}
        onUpdate={onUpdate}
        pinnedApps={pinnedApps}
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
    <div className="grid gap-5">
    <Card className="overflow-hidden border-white/10 bg-slate-950/55 py-0 text-slate-100 shadow-po-panel">
      <CardHeader className="border-b border-white/10 p-0">
        <div className="flex border-b border-white/10 px-5 pt-5">
          <div className="border-b-2 border-violet-400 px-1 pb-3 text-sm font-semibold text-violet-200">Installed apps</div>
          <div className="ml-7 pb-3 text-sm font-medium text-slate-500">Updates available <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{updateCount}</span></div>
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
                  <button className={cn('grid w-full items-center px-5 py-3 text-left text-sm transition hover:bg-slate-900/75', gridColumns, isSelected && 'bg-violet-600/10')} onClick={() => onManage(app.appId)} type="button">
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
    {pinnedApps.length > 0 && (
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
    <ObservedServicesPanel items={nonManagedObservedServices} onReviewService={onReviewService} />
    </div>
  );
}

function BasicApplicationsView({ accessByAppId, actionLoading, apps, healthByAppId, observedServices, onAction, onManage, onReviewService, onRollback, onSearch, onSelect, onUninstall, onUpdate, pinnedApps, reconciliation, search, selectedId, summary, telemetryByAppId, updateCount, updatesByAppId }: ApplicationsDashboardProps & { updateCount: number }) {
  const reconciliationByAppId = new Map((reconciliation?.apps || []).map((item) => [item.appId, item]));
  const nonManagedObservedServices = observedServices.filter((service) => isSecondaryObservedService(service));

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden border-white/10 bg-slate-950/45 py-0 text-slate-100 shadow-po-panel backdrop-blur-xl">
        <CardHeader className="border-b border-white/10 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h3 className="text-lg font-black text-white">Installed apps</h3>
              <p className="mt-1 text-sm text-slate-400">Open what is ready. Use Manage for repair, backup, update, and advanced details.</p>
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
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {apps.length === 0 && pinnedApps.length === 0 && nonManagedObservedServices.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-slate-950/45 px-5 py-10 text-center text-sm text-slate-500">No apps match your search.</div>
          ) : (
            <div className="grid gap-6">
              {(apps.length > 0 || pinnedApps.length > 0) && (
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
    </div>
  );
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
    <article className="grid gap-4 rounded-xl border border-sky-300/25 bg-sky-500/10 p-4 shadow-po-card transition hover:border-sky-300/40 hover:bg-sky-500/15">
      <button className="flex gap-3 text-left" onClick={() => service && onReviewService(service.id)} type="button">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-sky-300/20 bg-sky-500/15 text-sky-100">
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
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={!service} onClick={() => service && onReviewService(service.id)} size="sm" type="button" variant="outline">
          <Settings2 className="size-4" />
          Review
        </Button>
      </div>
    </article>
  );
}

function ApplicationCard({ access, actionLoading, app, health, isSelected, onAction, onManage, onRollback, onSelect, onUninstall, onUpdate, reconciliation, telemetry, update }: AppActionProps & { access?: AppAccessCheck; health?: AppHealthSnapshot | null; isSelected: boolean; reconciliation?: PrivateAccessReconciliationItem | null; telemetry?: AppTelemetry | null; update?: AppUpdateStatus | null; onSelect: (appId: string) => void }) {
  const status = displayStatus(app, health);
  const notice = appNotice(app, telemetry, access, health, reconciliation);
  const reason = statusReason(app, telemetry, access, health, reconciliation);
  const link = appCardPrimaryUrl(app);
  const busy = Boolean(actionLoading);
  const remediation = appRemediationDisplay({ app, health });
  const showRemediation = shouldShowRemediation(remediation);

  return (
    <article className={cn('grid gap-4 rounded-xl border bg-slate-950/48 p-4 shadow-po-card transition', isSelected ? 'border-violet-300/45 bg-violet-950/20' : 'border-white/10 hover:border-violet-300/30 hover:bg-slate-900/55')}>
      {showRemediation && (
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
      <button className="flex gap-3 text-left" onClick={() => onManage(app.appId)} type="button">
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
      </button>

      <button className="grid grid-cols-2 gap-2 text-left" onClick={() => onManage(app.appId)} type="button">
        <MiniMetric label="Access" value={accessSummary(app, access)} />
        <MiniMetric label="Backup" value={app.lastBackup || 'Not configured'} />
      </button>

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
            <Link to="/access">Manage access</Link>
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
