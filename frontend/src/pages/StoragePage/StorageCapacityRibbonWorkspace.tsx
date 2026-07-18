import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Copy,
  Database,
  FolderSearch,
  HardDrive,
  Info,
  PackageOpen,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RefreshStatus } from '@/components/RefreshStatus';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { ProjectDarkControlButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, Surface } from '@/components/primitives/Surface';
import { semanticStatusVariants, type SemanticStatusTone } from '@/components/primitives/SemanticVariants';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { appRoutes } from '@/appRouteManifest';
import { cn } from '@/lib/utils';
import type { AppStorageUsage, OrphanedStorage, StorageReport, StorageUsage } from '@/types/system';
import {
  aggregateAppStorageTrend,
  appStorageTotal,
  capacitySegments,
  formatStorageBytes,
  storageGrowthLabel,
  storageHeroCopy,
  storagePercentLabel,
  weeklyAppGrowth,
} from './StoragePage.presentation';

type StorageCapacityRibbonWorkspaceProps = {
  copiedPathId: string | null;
  onCopyPath: (value: string, id: string) => void;
  onReviewOrphan: (orphan: OrphanedStorage) => void;
  onRefresh: () => void;
  refreshing: boolean;
  report: StorageReport;
  showAdvancedMetrics: boolean;
  updatedAt: Date | null;
};

export function StorageCapacityRibbonWorkspace({
  copiedPathId,
  onCopyPath,
  onRefresh,
  onReviewOrphan,
  refreshing,
  report,
  showAdvancedMetrics,
  updatedAt,
}: StorageCapacityRibbonWorkspaceProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const appDataBytes = appStorageTotal(report);
  const appsWithBackupsOn = report.apps.filter((app) => app.backupEnabled).length;
  const largestApps = report.apps.slice(0, 3);
  const firstOrphan = report.orphanedData[0] ?? null;
  const hero = storageHeroCopy(report);

  function reviewOrphan(orphan: OrphanedStorage) {
    setDetailsOpen(false);
    onReviewOrphan(orphan);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <StorageCapacityHeader
        freeBytes={report.hostDisk.usableBytes}
        onRefresh={onRefresh}
        refreshing={refreshing}
        updatedAt={updatedAt}
        usedPercent={report.hostDisk.usedPercent}
      />

      <CapacityReadout appDataBytes={appDataBytes} appsWithBackupsOn={appsWithBackupsOn} report={report} summary={hero.summary} />

      <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(18rem,1fr)_minmax(17rem,0.8fr)_17rem]">
        <GrowthPanel apps={report.apps} status={report.status} weeklyGrowthBytes={weeklyAppGrowth(report)} />
        <SpaceDriversPanel apps={largestApps} totalApps={report.apps.length} />
        <AttentionPanel
          firstOrphan={firstOrphan}
          onOpenDetails={() => setDetailsOpen(true)}
          onReviewOrphan={reviewOrphan}
          report={report}
        />
      </section>

      <StorageDetailsSheet
        appDataBytes={appDataBytes}
        appsWithBackupsOn={appsWithBackupsOn}
        copiedPathId={copiedPathId}
        onCopyPath={onCopyPath}
        onOpenChange={setDetailsOpen}
        onReviewOrphan={reviewOrphan}
        open={detailsOpen}
        report={report}
        showAdvancedMetrics={showAdvancedMetrics}
      />
    </section>
  );
}

function StorageCapacityHeader({ freeBytes, onRefresh, refreshing, updatedAt, usedPercent }: {
  freeBytes: number;
  onRefresh: () => void;
  refreshing: boolean;
  updatedAt: Date | null;
  usedPercent: number;
}) {
  return (
    <Surface as="header" className="shrink-0 overflow-hidden border-sky-300/15 bg-[#07142b]/90 shadow-xl shadow-slate-950/20" tone="panel">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200 sm:grid">
            <HardDrive aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">Storage</h1>
            <p className="m-0 text-sm text-sky-100/70">Room for apps, backups, and a little breathing space.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <HeaderMetric label="Used" value={storagePercentLabel(usedPercent)} />
          <HeaderMetric label="Free" value={formatStorageBytes(freeBytes)} />
          <RefreshStatus className="pl-1" intervalLabel="Updates every 30s" onRefresh={onRefresh} refreshing={refreshing} tone="info" updatedAt={updatedAt} />
        </div>
      </div>
    </Surface>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20 rounded-xl border border-sky-300/15 bg-slate-950/25 px-3 py-2 text-right">
      <p className="text-sm font-semibold leading-none text-white">{value}</p>
      <p className="mt-1 text-[0.68rem] text-slate-400">{label}</p>
    </div>
  );
}

function CapacityReadout({ appDataBytes, appsWithBackupsOn, report, summary }: {
  appDataBytes: number;
  appsWithBackupsOn: number;
  report: StorageReport;
  summary: string;
}) {
  const externalBackups = report.backupDestination?.kind === 'external';
  const backupStatus = report.backupDestination?.status ?? 'unknown';

  return (
    <Surface className="shrink-0 border-sky-300/20 bg-slate-900 px-4 py-3 sm:px-5" tone="panel">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{report.headline || 'Storage position'}</p>
          <p className="mt-0.5 max-w-2xl text-xs text-sky-100/60">{summary}</p>
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

function StorageTrendChart({ trend }: { trend: Array<{ sampledAt: string; usedBytes: number }> }) {
  if (trend.length < 2) {
    return <div className="mt-4 grid h-28 place-items-center rounded-xl border border-dashed border-sky-300/20 bg-slate-950/25 px-4 text-center text-xs text-sky-100/60">Recent growth will appear after a few storage checks.</div>;
  }

  const highest = Math.max(...trend.map((point) => point.usedBytes), 1);
  return (
    <div className="mt-4 flex h-28 items-end gap-2 rounded-xl border border-sky-300/15 bg-slate-950/30 px-3 pb-3 pt-2" aria-label="Recent app storage samples">
      {trend.map((point, index) => (
        <div className="flex h-full flex-1 flex-col justify-end" key={point.sampledAt} title={`${formatStorageBytes(point.usedBytes)} at ${new Date(point.sampledAt).toLocaleString()}`}>
          <span className={cn('rounded-t bg-cyan-300/70', index === trend.length - 1 && 'bg-amber-300')} style={{ height: `${Math.max(16, (point.usedBytes / highest) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <ProjectInset className="min-w-0 border-sky-300/15 bg-slate-950/25 px-3 py-2">
      <p className="truncate text-[0.68rem] text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white" title={value}>{value}</p>
    </ProjectInset>
  );
}

function SpaceDriversPanel({ apps, totalApps }: { apps: AppStorageUsage[]; totalApps: number }) {
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
        {apps.length ? apps.map((app) => <SpaceDriverRow app={app} key={app.appId} />) : <ProjectInset className="border-sky-300/15 bg-slate-950/25 text-xs text-sky-100/60">Installed app storage will appear here.</ProjectInset>}
      </div>
      {totalApps > apps.length && <p className="mt-3 text-xs text-sky-100/55">Showing the largest {apps.length} of {totalApps} tracked apps.</p>}
    </Surface>
  );
}

function SpaceDriverRow({ app }: { app: AppStorageUsage }) {
  return (
    <ProjectInset className="flex min-w-0 items-center gap-2.5 border-sky-300/15 bg-slate-950/25 px-2.5 py-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-md border border-cyan-300/15 bg-cyan-400/10 text-cyan-200"><PackageOpen aria-hidden="true" className="size-3.5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-white">{app.appName}</span>
        <span className="block truncate text-[0.68rem] text-slate-400">{app.backupEnabled ? `${app.backupFrequency} backup` : 'Backup off'}</span>
      </span>
      <span className="text-right">
        <span className="block text-xs font-semibold text-white">{formatStorageBytes(app.usedBytes)}</span>
        <span className={cn('block text-[0.68rem]', app.sevenDayGrowthBytes > 0 ? 'text-amber-200' : 'text-sky-100/60')}>{storageGrowthLabel(app)}</span>
      </span>
    </ProjectInset>
  );
}

function AttentionPanel({ firstOrphan, onOpenDetails, onReviewOrphan, report }: {
  firstOrphan: OrphanedStorage | null;
  onOpenDetails: () => void;
  onReviewOrphan: (orphan: OrphanedStorage) => void;
  report: StorageReport;
}) {
  const recommendations = report.recommendations;
  const recommendation = recommendations.find((item) => item.tone !== 'success') ?? recommendations[0] ?? null;

  if (firstOrphan) {
    return (
      <Surface className="flex min-h-0 flex-col border-amber-300/20 bg-amber-400/5 p-4" tone="panel">
        <div className="flex items-start gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-amber-300/25 bg-amber-400/10 text-amber-100"><Trash2 aria-hidden="true" className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold text-white">One safe review</p>
            <p className="mt-1 text-xs leading-5 text-amber-100/75">{formatStorageBytes(firstOrphan.usedBytes)} is not tied to an installed app.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          <AttentionFact icon={FolderSearch} label="Candidate" value={firstOrphan.name} />
          <AttentionFact icon={HardDrive} label="Space to recover" value={formatStorageBytes(firstOrphan.usedBytes)} />
          <AttentionFact icon={ShieldCheck} label="Safety" value="Checkpoint before cleanup" />
        </div>
        <ProjectWarningButton className="mt-auto w-full" onClick={() => onReviewOrphan(firstOrphan)} type="button">
          Review cleanup <ChevronRight aria-hidden="true" className="size-3.5" />
        </ProjectWarningButton>
        <button className="mt-2 text-xs font-medium text-amber-100/75 underline-offset-4 hover:text-amber-50 hover:underline" onClick={onOpenDetails} type="button">View all storage details</button>
      </Surface>
    );
  }

  const needsAttention = report.status === 'warning' || report.status === 'critical' || Boolean(recommendation);
  return (
    <Surface className={cn('flex min-h-0 flex-col p-4', needsAttention ? 'border-amber-300/20 bg-amber-400/5' : 'border-emerald-300/20 bg-emerald-400/5')} tone="panel">
      <div className="flex items-start gap-2">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border', needsAttention ? 'border-amber-300/25 bg-amber-400/10 text-amber-100' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100')}>
          {needsAttention ? <CircleAlert aria-hidden="true" className="size-4" /> : <CheckCircle2 aria-hidden="true" className="size-4" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{needsAttention ? recommendation?.title || 'Storage needs review' : 'Storage looks good'}</p>
          <p className={cn('mt-1 text-xs leading-5', needsAttention ? 'text-amber-100/75' : 'text-emerald-100/75')}>{recommendation?.message || 'Autark-OS did not find unused app folders or an urgent capacity issue.'}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <AttentionFact icon={Archive} label="Backup data" value={`${formatStorageBytes(report.backupStorage.usedBytes)} · ${report.backupDestination?.kind === 'external' ? 'external drive' : 'this device'}`} />
        <AttentionFact icon={PackageOpen} label="Managed apps" value={`${report.apps.length} tracked`} />
        <AttentionFact icon={Info} label="Status" value={needsAttention ? 'Review recommended' : 'No action needed'} />
      </div>
      <ProjectDarkControlButton className="mt-auto w-full" onClick={onOpenDetails} type="button">View storage details <ChevronRight aria-hidden="true" className="size-3.5" /></ProjectDarkControlButton>
    </Surface>
  );
}

function AttentionFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <ProjectInset className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2 border-sky-300/15 bg-slate-950/30 px-3 py-2">
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 text-sky-100/65" />
      <span className="min-w-0"><span className="block text-[0.68rem] text-slate-400">{label}</span><span className="block truncate text-xs font-semibold text-white" title={value}>{value}</span></span>
    </ProjectInset>
  );
}

function StorageDetailsSheet({ appDataBytes, appsWithBackupsOn, copiedPathId, onCopyPath, onOpenChange, onReviewOrphan, open, report, showAdvancedMetrics }: {
  appDataBytes: number;
  appsWithBackupsOn: number;
  copiedPathId: string | null;
  onCopyPath: (value: string, id: string) => void;
  onOpenChange: (open: boolean) => void;
  onReviewOrphan: (orphan: OrphanedStorage) => void;
  open: boolean;
  report: StorageReport;
  showAdvancedMetrics: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-sky-300/30 bg-slate-900 p-0 text-slate-50 sm:!max-w-xl" side="right">
        <SheetHeader className="border-b border-sky-300/15 pr-12">
          <SheetTitle className="text-lg text-white">Storage details</SheetTitle>
          <SheetDescription className="text-slate-400">Full inventory, backup posture, and safe cleanup candidates.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-4">
            <DetailSection description="Capacity and the current next action." icon={HardDrive} title="Storage status">
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailFact label="Status" value={report.headline || 'Unknown'} />
                <DetailFact label="Free room" value={formatStorageBytes(report.hostDisk.usableBytes)} />
                <DetailFact label="App data" value={formatStorageBytes(appDataBytes)} />
                <DetailFact label="Used overall" value={storagePercentLabel(report.hostDisk.usedPercent)} />
              </div>
              {report.recommendations.length > 0 && <div className="mt-3 grid gap-2">{report.recommendations.map((recommendation) => <RecommendationRow key={recommendation.id} recommendation={recommendation} />)}</div>}
            </DetailSection>

            <DetailSection description="The largest managed app folders, ordered by current use." icon={PackageOpen} title="App data">
              <div className="grid gap-2">
                {report.apps.length ? report.apps.map((app) => <DetailedAppRow app={app} copiedPathId={copiedPathId} key={app.appId} onCopyPath={onCopyPath} showAdvancedMetrics={showAdvancedMetrics} />) : <ProjectInset className="text-sm text-slate-400">Installed app storage will appear here after apps are installed.</ProjectInset>}
              </div>
            </DetailSection>

            <DetailSection description="Backup data stays visible without mixing external-drive usage into this computer’s capacity." icon={Archive} title="Backups">
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailFact label="Apps with backups on" value={`${appsWithBackupsOn}/${report.apps.length}`} />
                <DetailFact label="Destination" value={report.backupDestination?.kind === 'external' ? 'External drive' : 'This device'} />
                <DetailFact label="Backup storage used" value={formatStorageBytes(report.backupStorage.usedBytes)} />
                {report.backupDestination && report.backupDestination.status !== 'ready' && <DetailFact label="Destination status" value={report.backupDestination.message} />}
              </div>
              <Link className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-200 hover:text-cyan-100" to={appRoutes.backups}>Open backups <ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
            </DetailSection>

            <DetailSection description="Autark-OS creates a safety checkpoint before removing unused app folders." icon={FolderSearch} title="Unused data">
              <div className="grid gap-2">
                {report.orphanedData.length ? report.orphanedData.map((orphan) => <DetailedOrphanRow key={orphan.path} onReview={() => onReviewOrphan(orphan)} orphan={orphan} showAdvancedMetrics={showAdvancedMetrics} />) : <ProjectInset className="text-sm text-slate-400">Autark-OS did not find orphaned app data.</ProjectInset>}
              </div>
            </DetailSection>

            {showAdvancedMetrics && <DetailSection description="Exact paths and filesystem totals for troubleshooting." icon={Database} title="Advanced filesystem details"><div className="grid gap-2">{[report.hostDisk, report.runtimeDisk, report.backupStorage].map((usage) => <UsageDetail key={usage.label} usage={usage} />)}</div></DetailSection>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({ children, description, icon: Icon, title }: { children: ReactNode; description: string; icon: LucideIcon; title: string }) {
  return (
    <section>
      <div className="flex items-start gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-400/10 text-cyan-200"><Icon aria-hidden="true" className="size-3.5" /></span>
        <div><h2 className="text-sm font-semibold text-white">{title}</h2><p className="mt-0.5 text-xs leading-5 text-slate-400">{description}</p></div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <ProjectInset className="border-sky-300/15 bg-slate-950/25 px-3 py-2"><p className="text-[0.68rem] text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-semibold text-white">{value}</p></ProjectInset>;
}

function RecommendationRow({ recommendation }: { recommendation: StorageReport['recommendations'][number] }) {
  const tone = recommendation.tone === 'danger' ? 'danger' : recommendation.tone === 'warning' ? 'warning' : recommendation.tone === 'success' ? 'success' : 'neutral';
  return <div className={cn('rounded-lg p-3', semanticStatusVariants({ tone }))}><p className="text-sm font-semibold text-white">{recommendation.title}</p><p className="mt-1 text-xs leading-5 text-current/80">{recommendation.message}</p></div>;
}

function DetailedAppRow({ app, copiedPathId, onCopyPath, showAdvancedMetrics }: { app: AppStorageUsage; copiedPathId: string | null; onCopyPath: (value: string, id: string) => void; showAdvancedMetrics: boolean }) {
  return (
    <ProjectInset className="border-sky-300/15 bg-slate-950/25 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{app.appName}</p><MetadataBadge>{app.status}</MetadataBadge></div><p className="mt-1 text-xs text-slate-400">Managed app data</p></div><p className="text-sm font-semibold text-white">{formatStorageBytes(app.usedBytes)}</p></div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><DetailFact label="Backups" value={app.backupEnabled ? app.backupFrequency : 'Off'} /><DetailFact label="7-day change" value={storageGrowthLabel(app)} /></div>
      {showAdvancedMetrics && <div className="mt-3 flex items-center gap-2"><p className="min-w-0 flex-1 select-text truncate font-mono text-xs text-slate-300" title={app.path}>{app.path}</p><ProjectDarkControlButton className="shrink-0" onClick={() => onCopyPath(app.path, app.appId)} size="sm" type="button">{copiedPathId === app.appId ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}{copiedPathId === app.appId ? 'Copied' : 'Copy path'}</ProjectDarkControlButton></div>}
    </ProjectInset>
  );
}

function DetailedOrphanRow({ onReview, orphan, showAdvancedMetrics }: { onReview: () => void; orphan: OrphanedStorage; showAdvancedMetrics: boolean }) {
  return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-400/5 p-3 text-amber-100">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-white">{orphan.name}</p><p className="mt-1 text-xs text-amber-100/75">Not tied to an installed app · {formatStorageBytes(orphan.usedBytes)}</p>{showAdvancedMetrics && <p className="mt-2 select-text break-all font-mono text-xs text-amber-100/85">{orphan.path}</p>}</div><ProjectWarningButton className="shrink-0" onClick={onReview} size="sm" type="button">Review</ProjectWarningButton></div>
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
  if (value >= 90) return 'danger';
  if (value >= 75) return 'warning';
  return 'success';
}
