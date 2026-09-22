import { PageHeader } from '@/components/layout/PageHeader';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowUpRight,
  AppWindow,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Copy,
  Database,
  FolderSearch,
  HardDrive,
  LineChart,
  PackageOpen,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RefreshStatus } from '@/components/RefreshStatus';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ProjectDarkControlButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, Surface } from '@/components/primitives/Surface';
import { semanticStatusVariants, type SemanticStatusTone } from '@/components/primitives/SemanticVariants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { appRoutes } from '@/appRouteManifest';
import { cn } from '@/lib/utils';
import type { AppStorageUsage, OrphanedStorage, StorageReport, StorageUsage } from '@/types/system';
import {
  aggregateAppStorageTrend,
  appStorageTotal,
  capacitySegments,
  formatStorageBytes,
  storageGrowthLabel,
  storagePercentLabel,
  weeklyAppGrowth,
} from './StoragePage.presentation';
import {
  parseStorageWorkspaceRoute,
  storageWorkspaceSearchWithSelection,
  type StorageWorkspaceTab,
} from './StoragePage.detailRoute';

type StorageCapacityRibbonWorkspaceProps = {
  appIconUrlById: Record<string, string | null>;
  copiedPathId: string | null;
  onCopyPath: (value: string, id: string) => void;
  onReviewOrphan: (orphan: OrphanedStorage) => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError?: string | null;
  report: StorageReport;
  updatedAt: Date | null;
};

export function StorageCapacityRibbonWorkspace({
  appIconUrlById,
  copiedPathId,
  onCopyPath,
  onRefresh,
  onReviewOrphan,
  refreshing,
  refreshError,
  report,
  updatedAt,
}: StorageCapacityRibbonWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const appDataBytes = appStorageTotal(report);
  const appsWithBackupsOn = report.apps.filter((app) => app.backupEnabled).length;
  const largestApps = report.apps.slice(0, 3);
  const route = useMemo(
    () => parseStorageWorkspaceRoute(searchParams, report.apps),
    [report.apps, searchParams],
  );
  const workspaceTab = route.tab;
  const selectedApp = report.apps.find((app) => app.appId === route.appId) ?? report.apps[0] ?? null;
  function selectApp(appId: string) {
    updateRoute({ appId, tab: 'apps' });
  }

  function selectTab(tab: StorageWorkspaceTab) {
    updateRoute({ appId: tab === 'apps' ? selectedApp?.appId ?? null : null, tab });
  }

  function updateRoute(selection: { appId: string | null; tab: StorageWorkspaceTab }) {
    setSearchParams(storageWorkspaceSearchWithSelection(searchParams, selection), { replace: true });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <StorageCapacityHeader
        freeBytes={report.hostDisk.usableBytes}
        onRefresh={onRefresh}
        refreshing={refreshing}
        refreshError={refreshError}
        updatedAt={updatedAt}
        usedPercent={report.hostDisk.usedPercent}
      />

      <CapacityReadout appDataBytes={appDataBytes} appsWithBackupsOn={appsWithBackupsOn} report={report} />

      <Tabs className="min-h-0 flex-1 gap-0" onValueChange={(value) => selectTab(value as StorageWorkspaceTab)} value={workspaceTab}>
        <Surface className="flex min-h-0 flex-1 flex-col overflow-hidden border-sky-300/20 bg-slate-900" tone="panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-300/15 px-3 py-3">
            <TabsList className="min-w-0 max-w-full justify-start overflow-x-auto rounded-lg border border-sky-300/15 bg-slate-950/25 p-1" variant="default">
              <StorageWorkspaceTabTrigger icon={LineChart} label="Overview" value="overview" />
              <StorageWorkspaceTabTrigger icon={PackageOpen} label="App data" value="apps" />
              <StorageWorkspaceTabTrigger icon={Archive} label="Backups" value="backups" />
              <StorageWorkspaceTabTrigger icon={Trash2} label="Cleanup" value="cleanup" />
              <StorageWorkspaceTabTrigger icon={Database} label="Technical details" value="advanced" />
            </TabsList>
          </div>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" value="overview">
            <section className="grid min-h-full gap-3 xl:grid-cols-[minmax(18rem,1fr)_minmax(17rem,0.8fr)_17rem]">
              <GrowthPanel apps={report.apps} status={report.status} weeklyGrowthBytes={weeklyAppGrowth(report)} />
              <SpaceDriversPanel appIconUrlById={appIconUrlById} apps={largestApps} onSelectApp={selectApp} totalApps={report.apps.length} />
              <AttentionPanel onOpenCleanup={() => selectTab('cleanup')} report={report} />
            </section>
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" value="apps">
            <AppDataWorkspace
              appIconUrlById={appIconUrlById}
              apps={report.apps}
              copiedPathId={copiedPathId}
              onCopyPath={onCopyPath}
              onSelectApp={selectApp}
              selectedApp={selectedApp}
              selectedAppId={route.appId ?? selectedApp?.appId ?? null}
            />
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" value="backups">
            <BackupWorkspace appsWithBackupsOn={appsWithBackupsOn} report={report} />
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" value="cleanup">
            <CleanupWorkspace onReviewOrphan={onReviewOrphan} orphans={report.orphanedData} />
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" value="advanced">
            <AdvancedStorageWorkspace report={report} />
          </TabsContent>
        </Surface>
      </Tabs>
    </section>
  );
}

function StorageWorkspaceTabTrigger({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: StorageWorkspaceTab }) {
  return <TabsTrigger className="shrink-0 px-3 py-1.5 text-xs text-sky-100/60 data-active:bg-cyan-300/15 data-active:text-cyan-100" value={value}><Icon aria-hidden="true" className="size-3.5" />{label}</TabsTrigger>;
}

function StorageCapacityHeader({ freeBytes, onRefresh, refreshing, refreshError, updatedAt, usedPercent }: {
  freeBytes: number;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError?: string | null;
  updatedAt: Date | null;
  usedPercent: number;
}) {
  return (
    <PageHeader icon={HardDrive} title="Storage" description="Room for apps, backups, and a little breathing space." metrics={[
      { label: 'Used', value: storagePercentLabel(usedPercent) },
      { label: 'Free', value: formatStorageBytes(freeBytes) },
    ]}>
      <RefreshStatus error={refreshError} intervalLabel="Updates every 30s" onRefresh={onRefresh} refreshing={refreshing} tone="info" updatedAt={updatedAt} />
    </PageHeader>
  );
}

function CapacityReadout({ appDataBytes, appsWithBackupsOn, report }: {
  appDataBytes: number;
  appsWithBackupsOn: number;
  report: StorageReport;
}) {
  const externalBackups = report.backupDestination?.kind === 'external';
  const backupStatus = report.backupDestination?.status ?? 'unknown';

  return (
    <Surface className="shrink-0 border-sky-300/20 bg-slate-900 px-4 py-3 sm:px-5" tone="panel">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{report.headline || 'Storage position'}</p>
          <p className="mt-0.5 max-w-2xl text-xs text-sky-100/60">{report.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sky-100/60">
          <CapacityValue label="app data" value={formatStorageBytes(appDataBytes)} />
          <CapacityValue label={externalBackups ? 'external backups' : 'backups'} value={formatStorageBytes(report.backupStorage.usedBytes)} />
          <CapacityValue label="free" value={formatStorageBytes(report.hostDisk.usableBytes)} />
        </div>
      </div>
      <CapacityRibbon report={report} />
      {externalBackups && (
        <p className={cn('mt-2 text-xs', backupStatus === 'ready' ? 'text-emerald-100/75' : 'text-amber-100/75')}>
          Backup storage is on a separate drive, so it is shown here but not counted in this computer’s capacity bar.
        </p>
      )}
      <p className="sr-only">{appsWithBackupsOn} of {report.apps.length} managed apps have backups enabled.</p>
    </Surface>
  );
}

function CapacityValue({ label, value }: { label: string; value: string }) {
  return <span><strong className="text-white">{value}</strong> {label}</span>;
}

function CapacityRibbon({ report }: { report: StorageReport }) {
  const segments = capacitySegments(report);
  const total = Math.max(1, report.hostDisk.totalBytes);

  return (
    <div className="mt-3 h-5 overflow-hidden rounded-full border border-sky-300/15 bg-slate-950 p-0.5" role="img" aria-label={`Storage capacity: ${storagePercentLabel(report.hostDisk.usedPercent)} used`}>
      <div className="flex h-full overflow-hidden rounded-full">
        {segments.map((segment) => (
          <span
            className={cn('h-full first:rounded-l-full last:rounded-r-full', capacitySegmentClass(segment.tone))}
            key={segment.tone}
            style={{ width: `${(segment.bytes / total) * 100}%` }}
            title={`${segment.label}: ${formatStorageBytes(segment.bytes)}`}
          />
        ))}
      </div>
    </div>
  );
}

function capacitySegmentClass(tone: 'apps' | 'backups' | 'free' | 'other') {
  if (tone === 'apps') return 'bg-cyan-300';
  if (tone === 'backups') return 'bg-emerald-400';
  if (tone === 'free') return 'bg-slate-300';
  return 'bg-slate-600';
}

function GrowthPanel({ apps, status, weeklyGrowthBytes }: { apps: AppStorageUsage[]; status: string; weeklyGrowthBytes: number }) {
  const trend = useMemo(() => aggregateAppStorageTrend(apps), [apps]);
  const largestChange = apps.reduce<AppStorageUsage | null>((largest, app) => !largest || app.sevenDayGrowthBytes > largest.sevenDayGrowthBytes ? app : largest, null);
  const watching = status === 'warning' || status === 'critical' || weeklyGrowthBytes > 0;
  return (
    <Surface className="flex min-h-0 flex-col border-sky-300/20 bg-slate-900 p-4" tone="panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Weekly growth</p>
          <p className="mt-1 text-xs text-sky-100/60">{growthSummary(apps.length, weeklyGrowthBytes)}</p>
        </div>
        <StatusBadge tone={watching ? 'warning' : 'success'}>{watching ? 'Watching' : 'Stable'}</StatusBadge>
      </div>
      <StorageTrendChart trend={trend} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <InlineMetric label="Largest change" value={largestChange?.appName || 'No app data'} />
        <InlineMetric label="This week" value={signedBytes(weeklyGrowthBytes)} />
        <InlineMetric label="Recent samples" value={trend.length ? String(trend.length) : 'Waiting'} />
      </div>
    </Surface>
  );
}

function StorageTrendChart({ emphasizeChanges = false, trend }: { emphasizeChanges?: boolean; trend: Array<{ sampledAt: string; usedBytes: number }> }) {
  if (trend.length < 2) {
    return <div className="mt-4 grid h-28 place-items-center rounded-xl border border-dashed border-sky-300/20 bg-slate-950/25 px-4 text-center text-xs text-sky-100/60">Recent growth will appear after a few storage checks.</div>;
  }

  const lowest = Math.min(...trend.map((point) => point.usedBytes));
  const highest = Math.max(...trend.map((point) => point.usedBytes), 1);
  const range = highest - lowest;
  return (
    <div className="mt-4 flex h-28 items-end gap-2 rounded-xl border border-sky-300/15 bg-slate-950/30 px-3 pb-3 pt-2" aria-label={emphasizeChanges ? 'Recent app storage change, scaled to the app’s recent range' : 'Recent app storage samples'}>
      {trend.map((point, index) => (
        <div className="flex h-full flex-1 flex-col justify-end" key={point.sampledAt} title={`${formatStorageBytes(point.usedBytes)} at ${new Date(point.sampledAt).toLocaleString()}`}>
          <span className={cn('rounded-t bg-cyan-300/70', index === trend.length - 1 && 'bg-amber-300')} style={{ height: `${storageTrendBarHeight(point.usedBytes, highest, lowest, range, emphasizeChanges)}%` }} />
        </div>
      ))}
    </div>
  );
}

function storageTrendBarHeight(value: number, highest: number, lowest: number, range: number, emphasizeChanges: boolean) {
  if (!emphasizeChanges) return Math.max(24, (value / highest) * 100);
  if (range === 0) return 72;
  return 36 + ((value - lowest) / range) * 64;
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <ProjectInset className="min-w-0 border-sky-300/15 bg-slate-950/25 px-3 py-2">
      <p className="truncate text-[0.68rem] text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white" title={value}>{value}</p>
    </ProjectInset>
  );
}

function SpaceDriversPanel({ appIconUrlById, apps, onSelectApp, totalApps }: {
  appIconUrlById: Record<string, string | null>;
  apps: AppStorageUsage[];
  onSelectApp: (appId: string) => void;
  totalApps: number;
}) {
  return (
    <Surface className="min-h-0 border-sky-300/20 bg-slate-900 p-4" tone="panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Space drivers</p>
          <p className="mt-1 text-xs text-sky-100/60">Largest managed apps first</p>
        </div>
        <PackageOpen aria-hidden="true" className="size-4 text-cyan-200" />
      </div>
      <div className="mt-3 grid gap-2">
        {apps.length
          ? apps.map((app) => <SpaceDriverRow app={app} iconUrl={appIconUrlById[app.appId]} key={app.appId} onClick={() => onSelectApp(app.appId)} />)
          : <ProjectInset className="border-sky-300/15 bg-slate-950/25 text-xs text-sky-100/60">Installed app storage will appear here.</ProjectInset>}
      </div>
      {totalApps > apps.length && <p className="mt-3 text-xs text-sky-100/55">Showing the largest {apps.length} of {totalApps} tracked apps. Select one to inspect its storage.</p>}
    </Surface>
  );
}

function SpaceDriverRow({ app, iconUrl, onClick }: { app: AppStorageUsage; iconUrl: string | null; onClick: () => void }) {
  return (
    <button className="flex min-w-0 items-center gap-2.5 rounded-lg border border-sky-300/15 bg-slate-950/25 px-2.5 py-2 text-left transition hover:border-cyan-300/30 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" onClick={onClick} type="button">
      <StorageAppIcon appName={app.appName} iconUrl={iconUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-white">{app.appName}</span>
        <span className="block truncate text-[0.68rem] text-slate-400">{app.backupEnabled ? `${app.backupFrequency} backup` : 'Backup off'}</span>
      </span>
      <span className="text-right">
        <span className="block text-xs font-semibold text-white">{formatStorageBytes(app.usedBytes)}</span>
        <span className={cn('block text-[0.68rem]', app.sevenDayGrowthBytes > 0 ? 'text-amber-200' : 'text-sky-100/60')}>{storageGrowthLabel(app)}</span>
      </span>
    </button>
  );
}

function AttentionPanel({ onOpenCleanup, report }: { onOpenCleanup: () => void; report: StorageReport }) {
  return (
    <Surface className="self-start p-4" tone="panel">
      <h2 className="text-sm font-semibold text-white">Storage recommendations</h2>
      <div className="mt-3 grid gap-2">
        {report.recommendations.length ? report.recommendations.map((recommendation) => <RecommendationRow key={recommendation.id} recommendation={recommendation} />) : <p className="text-sm text-muted-foreground">No recommendations reported.</p>}
      </div>
      <ProjectDarkControlButton className="mt-4 w-full" onClick={onOpenCleanup} type="button">Open cleanup workspace <ChevronRight aria-hidden="true" className="size-3.5" /></ProjectDarkControlButton>
    </Surface>
  );
}

function AppDataWorkspace({
  appIconUrlById,
  apps,
  copiedPathId,
  onCopyPath,
  onSelectApp,
  selectedApp,
  selectedAppId,
}: {
  appIconUrlById: Record<string, string | null>;
  apps: AppStorageUsage[];
  copiedPathId: string | null;
  onCopyPath: (value: string, id: string) => void;
  onSelectApp: (appId: string) => void;
  selectedApp: AppStorageUsage | null;
  selectedAppId: string | null;

}) {
  return (
    <section className="grid min-h-full gap-3 xl:grid-cols-[minmax(15rem,0.55fr)_minmax(0,1.45fr)]">
      <Surface className="min-h-0 p-3" tone="inset">
        <div className="flex items-center justify-between gap-3 px-1">
          <div><p className="text-sm font-semibold text-white">App data</p><p className="mt-1 text-xs text-sky-100/60">Choose an app to inspect its storage.</p></div>
          <PackageOpen aria-hidden="true" className="size-4 text-cyan-200" />
        </div>
        <div className="mt-3 grid gap-2">
          {apps.length
            ? apps.map((app) => <StorageAppSelectorRow active={app.appId === selectedAppId} app={app} iconUrl={appIconUrlById[app.appId]} key={app.appId} onClick={() => onSelectApp(app.appId)} />)
            : <ProjectInset className="border-sky-300/15 bg-slate-950/25 text-sm text-slate-400">Installed app storage will appear here after apps are installed.</ProjectInset>}
        </div>
      </Surface>

      <Surface className="min-h-0 p-4" tone="panel">
        {!selectedApp ? (
          <div className="grid h-full min-h-56 place-items-center text-center"><div><PackageOpen aria-hidden="true" className="mx-auto size-5 text-sky-100/50" /><p className="mt-3 text-sm font-semibold text-white">No app storage yet</p><p className="mt-1 text-xs text-sky-100/60">Installed apps will appear here when they report storage use.</p></div></div>
        ) : (
          <div className="flex min-h-full flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <StorageAppIcon appName={selectedApp.appName} className="size-10 rounded-xl" iconUrl={appIconUrlById[selectedApp.appId]} />
                <div className="min-w-0"><p className="truncate text-base font-semibold text-white">{selectedApp.appName}</p><p className="mt-0.5 text-xs text-sky-100/60">Managed app storage</p></div>
              </div>
              <MetadataBadge>{selectedApp.status}</MetadataBadge>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <DetailFact label="Current use" value={formatStorageBytes(selectedApp.usedBytes)} />
              <DetailFact label="7-day change" value={storageGrowthLabel(selectedApp)} />
              <DetailFact label="Backups" value={selectedApp.backupEnabled ? selectedApp.backupFrequency : 'Off'} />
            </div>
            <StorageTrendChart emphasizeChanges trend={selectedApp.trend} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <DetailFact label="Restore protection" value={selectedApp.backupState === 'protected_by_restore_point' ? 'Verified restore point' : selectedApp.backupState === 'backup_disabled' ? 'Backups off — review retained points in Backups' : 'No compatible verified restore point'} />
              <DetailFact label="Storage status" value={selectedApp.status} />
            </div>
            <details className="mt-3"><summary className="cursor-pointer text-sm text-muted-foreground">Technical details</summary><div className="mt-3 flex items-center gap-2"><p className="min-w-0 flex-1 select-text truncate font-mono text-xs text-slate-300" title={selectedApp.path}>{selectedApp.path}</p><ProjectDarkControlButton className="shrink-0" onClick={() => onCopyPath(selectedApp.path, selectedApp.appId)} size="sm" type="button">{copiedPathId === selectedApp.appId ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}{copiedPathId === selectedApp.appId ? 'Copied' : 'Copy path'}</ProjectDarkControlButton></div></details>
          </div>
        )}
      </Surface>
    </section>
  );
}

function StorageAppSelectorRow({ active, app, iconUrl, onClick }: { active: boolean; app: AppStorageUsage; iconUrl: string | null; onClick: () => void }) {
  return <button aria-pressed={active} className={cn('flex w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60', active ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-sky-300/15 bg-slate-950/25 hover:border-cyan-300/30 hover:bg-slate-800')} onClick={onClick} type="button"><StorageAppIcon appName={app.appName} iconUrl={iconUrl} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white">{app.appName}</span><span className="mt-0.5 block truncate text-xs text-sky-100/60">{app.backupEnabled ? `${app.backupFrequency} backup` : 'Backup off'}</span></span><span className="shrink-0 text-right"><span className="block text-xs font-semibold text-white">{formatStorageBytes(app.usedBytes)}</span><span className={cn('block text-[0.68rem]', app.sevenDayGrowthBytes > 0 ? 'text-amber-200' : 'text-sky-100/60')}>{storageGrowthLabel(app)}</span></span></button>;
}

function BackupWorkspace({ appsWithBackupsOn, report }: { appsWithBackupsOn: number; report: StorageReport }) {
  const destination = report.backupDestination;
  const destinationReady = !destination || destination.status === 'ready';
  return (
    <section className="grid min-h-full gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
      <Surface className="p-4" tone="inset">
        <WorkspaceHeading description="Backup data stays visible here without adding external-drive usage to this computer’s capacity." icon={Archive} title="Backup posture" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <DetailFact label="Apps with backups on" value={`${appsWithBackupsOn}/${report.apps.length}`} />
          <DetailFact label="Destination" value={destination?.kind === 'external' ? 'External drive' : 'This device'} />
          <DetailFact label="Backup storage used" value={formatStorageBytes(report.backupStorage.usedBytes)} />
          <DetailFact label="Destination status" value={destination?.message || 'Not configured'} />
        </div>
        <Link className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-200 hover:text-cyan-100 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" to={appRoutes.backups}>Open backups <ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
      </Surface>
      <Surface className={cn('p-4', destinationReady ? 'border-emerald-300/20 bg-emerald-400/5' : 'border-amber-300/20 bg-amber-400/5')} tone="panel">
        <div className="flex items-start gap-2"><span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border', destinationReady ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100')}>{destinationReady ? <ShieldCheck aria-hidden="true" className="size-4" /> : <CircleAlert aria-hidden="true" className="size-4" />}</span><div><p className="text-sm font-semibold text-white">{destinationReady ? 'Backup destination is ready' : 'Backup destination needs attention'}</p><p className={cn('mt-1 text-xs leading-5', destinationReady ? 'text-emerald-100/75' : 'text-amber-100/75')}>{destination?.message || 'Choose a destination in Backups before creating recovery files.'}</p></div></div>
      </Surface>
    </section>
  );
}

function CleanupWorkspace({ onReviewOrphan, orphans }: { onReviewOrphan: (orphan: OrphanedStorage) => void; orphans: OrphanedStorage[] }) {
  return (
    <section className="grid min-h-full gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
      <Surface className="p-4" tone="inset">
        <WorkspaceHeading description="Review unused folders before archiving their declared app data and removing them." icon={FolderSearch} title="Unused data" />
        <div className="mt-4 grid gap-2">{orphans.length ? orphans.map((orphan) => <DetailedOrphanRow key={orphan.path} onReview={() => onReviewOrphan(orphan)} orphan={orphan} />) : <ProjectInset className="border-emerald-300/20 bg-emerald-400/5 text-sm text-emerald-100/75">Autark-OS did not find unused app data.</ProjectInset>}</div>
      </Surface>
      <Surface className="p-4" tone="panel"><WorkspaceHeading description="Archives require manual recovery; they are not Backups restore points." icon={ShieldCheck} title="Cleanup steps" /><div className="mt-4 grid gap-2"><DetailFact label="1" value="Review and confirm" /><DetailFact label="2" value="Archive declared app data" /><DetailFact label="3" value="Remove unused folder" /></div></Surface>
    </section>
  );
}

function AdvancedStorageWorkspace({ report }: { report: StorageReport }) {
  return <section className="min-h-full"><Surface className="p-4" tone="inset"><WorkspaceHeading description="Exact paths and filesystem totals for troubleshooting." icon={Database} title="Advanced filesystem details" /><div className="mt-4 grid gap-2">{[report.hostDisk, report.runtimeDisk, report.backupStorage].map((usage) => <UsageDetail key={usage.label} usage={usage} />)}</div></Surface></section>;
}

function WorkspaceHeading({ description, icon: Icon, title }: { description: string; icon: LucideIcon; title: string }) {
  return <div className="flex items-start gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-400/10 text-cyan-200"><Icon aria-hidden="true" className="size-3.5" /></span><div><h2 className="text-sm font-semibold text-white">{title}</h2><p className="mt-0.5 text-xs leading-5 text-slate-400">{description}</p></div></div>;
}

function StorageAppIcon({ appName, className, iconUrl }: { appName: string; className?: string; iconUrl: string | null }) {
  return <span aria-hidden="true" className={cn('relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-cyan-300/15 bg-cyan-400/10 text-cyan-200', className)}><AppWindow aria-hidden="true" className="size-3.5" />{iconUrl && <img alt="" className="absolute inset-0 size-full object-contain p-1" onError={(event) => { event.currentTarget.style.display = 'none'; }} src={iconUrl} />}</span>;
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <ProjectInset className="border-sky-300/15 bg-slate-950/25 px-3 py-2"><p className="text-[0.68rem] text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-semibold text-white">{value}</p></ProjectInset>;
}

function RecommendationRow({ recommendation }: { recommendation: StorageReport['recommendations'][number] }) {
  const tone = recommendation.tone === 'danger' ? 'danger' : recommendation.tone === 'warning' ? 'warning' : recommendation.tone === 'success' ? 'success' : 'neutral';
  return <div className={cn('rounded-lg p-3', semanticStatusVariants({ tone }))}><p className="text-sm font-semibold text-white">{recommendation.title}</p><p className="mt-1 text-xs leading-5 text-current/80">{recommendation.message}</p></div>;
}

function DetailedOrphanRow({ onReview, orphan }: { onReview: () => void; orphan: OrphanedStorage }) {
  return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-400/5 p-3 text-amber-100">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-white">{orphan.name}</p><p className="mt-1 text-xs text-amber-100/75">Not tied to an installed app · {formatStorageBytes(orphan.usedBytes)}</p>{!orphan.cleanupAllowed && <p className="mt-2 text-xs leading-5 text-amber-100">Cleanup blocked: {orphan.cleanupBlockedReason}</p>}<details className="mt-2"><summary className="cursor-pointer text-sm text-muted-foreground">Technical details</summary><p className="mt-2 select-text break-all font-mono text-xs text-amber-100/85">{orphan.path}</p></details></div><DisabledAction disabled={!orphan.cleanupAllowed} reason={orphan.cleanupBlockedReason || 'Autark-OS cannot prove this folder is safe to clean up.'}><ProjectWarningButton className="shrink-0" disabled={!orphan.cleanupAllowed} onClick={onReview} size="sm" type="button">Review</ProjectWarningButton></DisabledAction></div>
    </div>
  );
}

function UsageDetail({ usage }: { usage: StorageUsage }) {
  return (
    <ProjectInset className="border-sky-300/15 bg-slate-950/25 px-3 py-3">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-white">{usage.label}</p><p className="mt-1 select-text truncate font-mono text-xs text-slate-400" title={usage.path}>{usage.path}</p></div><StatusBadge tone={usageTone(usage.usedPercent)}>{storagePercentLabel(usage.usedPercent)}</StatusBadge></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><DetailFact label="Used" value={formatStorageBytes(usage.usedBytes)} /><DetailFact label="Free" value={formatStorageBytes(usage.usableBytes)} /><DetailFact label="Total" value={formatStorageBytes(usage.totalBytes)} /></div>
    </ProjectInset>
  );
}

function growthSummary(appCount: number, weeklyGrowthBytes: number) {
  if (!appCount) return 'No managed app storage is reporting yet.';
  if (weeklyGrowthBytes === 0) return 'No meaningful change across managed app storage.';
  return `${signedBytes(weeklyGrowthBytes)} across managed app storage.`;
}

function signedBytes(value: number) {
  if (value === 0) return 'No change';
  return `${value > 0 ? '+' : '-'}${formatStorageBytes(Math.abs(value))}`;
}

function usageTone(value: number): SemanticStatusTone {
  if (!Number.isFinite(value) || value < 0) return 'neutral';
  if (value >= 90) return 'danger';
  if (value >= 75) return 'warning';
  return 'success';
}
