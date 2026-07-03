import { useMemo, useState } from 'react';
import { AlertTriangle, Archive, CheckCircle2, Copy, Database, FolderSearch, HardDrive, Info, Loader2, PackageOpen, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiErrorMessage } from '@/api/httpClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectInlineEmptyState } from '@/components/primitives/EmptyState';
import { ProjectDarkControlButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel, Surface } from '@/components/primitives/Surface';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { backupSafetyChecklist } from '@/lib/backupSafety';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { cn } from '@/lib/utils';
import { useCleanupOrphanMutation, useStorageReportRepository } from '@/repositories/storageRepository';
import type { AppStorageUsage, OrphanedStorage, StorageRecommendation, StorageReport, StorageUsage } from '@/types/system';

const StoragePanel = ProjectPanel;
const StorageInset = ProjectInset;

function StoragePage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const storage = useStorageReportRepository();
  const cleanupOrphanMutation = useCleanupOrphanMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [cleanupTarget, setCleanupTarget] = useState<OrphanedStorage | null>(null);
  const [cleanupConfirmation, setCleanupConfirmation] = useState('');
  const report = storage.report;
  const error = actionError ?? (storage.error ? apiErrorMessage(storage.error, 'Storage data could not be loaded.') : null);

  async function copy(value: string, id: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1600);
  }

  async function cleanupOrphan() {
    if (!cleanupTarget || cleanupConfirmation !== cleanupTarget.name) {
      return;
    }
    setActionError(null);
    try {
      const result = await cleanupOrphanMutation.mutateAsync(cleanupTarget.name);
      showActionNotification({
        ok: true,
        severity: 'success',
        title: 'Unused data cleaned up',
        message: `${result.message} Safety checkpoint saved at ${result.safetyCheckpointPath}.`,
      }, 'Unused data cleaned up');
      setCleanupTarget(null);
      setCleanupConfirmation('');
    } catch (cleanupError) {
      const message = apiErrorMessage(cleanupError, 'Unused data could not be cleaned up.');
      setActionError(message);
      showActionErrorNotification(cleanupError, 'Unused data could not be cleaned up');
    }
  }

  const largestApps = useMemo(() => report?.apps.slice(0, 8) ?? [], [report]);
  const appsWithBackupsOn = report?.apps.filter((app) => app.backupEnabled).length ?? 0;
  const appDataBytes = useMemo(() => report?.apps.reduce((total, app) => total + app.usedBytes, 0) ?? 0, [report]);
  const storageHero = getStorageHero(report);
  const cleanupCandidates = report?.orphanedData.slice(0, 4) ?? [];

  if (storage.isLoading) {
    return (
      <StorageLoadingState />
    );
  }

  return (
    <PageShell>
      <Surface className="overflow-hidden" tone="panel">
        <div className="grid gap-6 border-b border-sky-400/20 bg-slate-900 p-6 md:p-7 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-cyan-200">Storage</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-white md:text-4xl">{storageHero.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">{storageHero.summary}</p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Badge className={cn('border', usageBadgeTone(report?.hostDisk.usedPercent ?? -1))}>{percentLabel(report?.hostDisk.usedPercent)} used</Badge>
              <span className="text-sm text-slate-400">{report ? `${formatBytes(report.hostDisk.usableBytes)} free on this computer` : 'Storage totals unavailable'}</span>
            </div>
          </div>
          <StorageInset className="grid gap-4 bg-slate-900 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-white">Space at a glance</p>
                <p className="mt-1 text-xs text-slate-400">Apps, backups, and free space in one view.</p>
              </div>
              <RefreshStatus intervalLabel="Auto-updates every 30s" onRefresh={() => void storage.refresh()} refreshing={storage.isFetching} tone="cyan" updatedAt={storage.updatedAt} />
            </div>
            <DiskCapacityGauge usage={report?.hostDisk ?? null} />
          </StorageInset>
        </div>

        {error && <StorageErrorState message={error} onRetry={() => void storage.refresh()} />}

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <SignalCard icon={statusIcon(report?.status)} label="Health" value={report?.headline || 'Unknown'} detail={storageHero.action} tone={statusTone(report?.status)} />
          <SignalCard icon={HardDrive} label="Free space" value={report ? formatBytes(report.hostDisk.usableBytes) : 'Unknown'} detail={report ? `${percentLabel(report.hostDisk.usedPercent)} used overall` : 'Not reported'} tone={usageTone(report?.hostDisk.usedPercent)} />
          <SignalCard icon={Database} label="App data" value={formatBytes(appDataBytes)} detail={`${report?.apps.length ?? 0} installed apps tracked`} tone="cyan" />
          <SignalCard icon={Archive} label="Backup data" value={report ? formatBytes(report.backupStorage.usedBytes) : 'Unknown'} detail={`${appsWithBackupsOn}/${report?.apps.length ?? 0} apps with backups on`} tone="green" />
        </div>
      </Surface>

      {report && (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="flex flex-col gap-5">
              <StoragePanel>
                <SectionHeader icon={HardDrive} title="Space breakdown" description="The main places storage goes: apps you run, backups that protect them, and free room for growth." />
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <StorageShareCard color="bg-cyan-300" detail={`${report.apps.length} installed apps`} label="App data" totalBytes={report.hostDisk.totalBytes} valueBytes={appDataBytes} />
                  <StorageShareCard color="bg-emerald-400" detail={`${appsWithBackupsOn}/${report.apps.length} apps with backups on`} label="Backups" totalBytes={report.hostDisk.totalBytes} valueBytes={report.backupStorage.usedBytes} />
                  <StorageShareCard color="bg-sky-400" detail="Ready for installs and growth" label="Free room" totalBytes={report.hostDisk.totalBytes} valueBytes={report.hostDisk.usableBytes} />
                </div>
              </StoragePanel>

              {showAdvancedMetrics && (
                <StoragePanel>
                  <SectionHeader icon={HardDrive} title="Advanced filesystem details" description="Exact paths and filesystem totals for troubleshooting." />
                  <div className="mt-5 grid gap-4 lg:grid-cols-3">
                    <UsagePanel usage={report.hostDisk} title="Host disk" />
                    <UsagePanel usage={report.runtimeDisk} title="Autark-OS data" />
                    <UsagePanel usage={report.backupStorage} title="Backups" />
                  </div>
                </StoragePanel>
              )}

              <StoragePanel>
                <SectionHeader icon={PackageOpen} title="Largest apps" description="Start here if app data is the reason storage is growing." />
                <div className="mt-5 grid gap-3">
                  {largestApps.length ? largestApps.map((app) => <AppStorageRow app={app} copied={copied} key={app.appId} onCopy={copy} showAdvancedMetrics={showAdvancedMetrics} />) : (
                    <EmptyState title="No app data found" message="Installed app storage will appear here after apps are installed." />
                  )}
                </div>
              </StoragePanel>
            </div>

            <aside className="flex flex-col gap-5">
              <StoragePanel>
                <SectionHeader compact icon={Info} title="Needs attention" />
                <div className="mt-4 grid gap-3">
                  {report.recommendations.length ? report.recommendations.map((recommendation) => <RecommendationCard key={recommendation.id} recommendation={recommendation} />) : (
                    <EmptyState compact title="No storage issues" message="Autark-OS did not find anything that needs storage cleanup right now." />
                  )}
                </div>
              </StoragePanel>

              <StoragePanel>
                <SectionHeader compact icon={Archive} title="Backups" />
                <div className="mt-4 grid gap-3">
                  <FactRow label="Apps with backups on" value={`${appsWithBackupsOn}/${report.apps.length}`} />
                  <FactRow label="Backup storage used" value={formatBytes(report.backupStorage.usedBytes)} />
                  {showAdvancedMetrics && <FactRow label="Backup folder" value={report.backupStorage.path} />}
                </div>
              </StoragePanel>

              <StoragePanel>
                <SectionHeader compact icon={FolderSearch} title="Unused data" />
                <div className="mt-4 grid gap-3">
                  {cleanupCandidates.length ? cleanupCandidates.map((orphan) => <OrphanedRow key={orphan.path} onCleanup={setCleanupTarget} orphan={orphan} showAdvancedMetrics={showAdvancedMetrics} />) : (
                    <EmptyState compact title="No unused folders" message="Autark-OS did not find orphaned app data." />
                  )}
                </div>
              </StoragePanel>
            </aside>
          </div>
        </>
      )}
      <CleanupDialog
        confirmation={cleanupConfirmation}
        loading={cleanupOrphanMutation.isPending}
        onChange={setCleanupConfirmation}
        onClose={() => {
          setCleanupTarget(null);
          setCleanupConfirmation('');
        }}
        onConfirm={() => void cleanupOrphan()}
        target={cleanupTarget}
      />
    </PageShell>
  );
}

function DiskCapacityGauge({ usage }: { usage: StorageUsage | null }) {
  const percent = usage ? safePercent(usage.usedPercent) : 0;
  const label = usage ? percentLabel(usage.usedPercent) : 'Unknown';
  return (
    <div className="grid place-items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
      <div
        className="grid size-40 place-items-center rounded-full"
        style={{ background: `conic-gradient(rgb(103 232 249) ${percent * 3.6}deg, rgb(15 23 42) 0deg)` }}
      >
        <div className="grid size-28 place-items-center rounded-full border border-sky-400/25 bg-slate-950 text-center">
          <div>
            <p className="text-3xl font-black text-white">{label}</p>
            <p className="text-xs font-bold uppercase text-slate-500">used</p>
          </div>
        </div>
      </div>
      <div className="grid w-full gap-2">
        <GaugeLine color="bg-emerald-400" label="Free" value={usage ? formatBytes(usage.usableBytes) : 'Unknown'} />
        <GaugeLine color="bg-cyan-300" label="Used" value={usage ? formatBytes(usage.usedBytes) : 'Unknown'} />
        <GaugeLine color="bg-slate-500" label="Total" value={usage ? formatBytes(usage.totalBytes) : 'Unknown'} />
      </div>
    </div>
  );
}

function GaugeLine({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-400/25 bg-slate-800 px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-2 text-slate-400"><span className={cn('size-2 rounded-full', color)} />{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function StorageShareCard({ color, detail, label, totalBytes, valueBytes }: { color: string; detail: string; label: string; totalBytes: number; valueBytes: number }) {
  const width = totalBytes > 0 ? Math.max(4, Math.min(100, (valueBytes / totalBytes) * 100)) : 0;
  return (
    <StorageInset className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{label}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <p className="text-sm font-black text-white">{formatBytes(valueBytes)}</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-950">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${width}%` }} />
      </div>
    </StorageInset>
  );
}

function UsagePanel({ title, usage }: { title: string; usage: StorageUsage }) {
  return (
    <StorageInset className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-white">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{locationLabel(title)}</p>
        </div>
        <Badge className={cn('border', usageBadgeTone(usage.usedPercent))}>{percentLabel(usage.usedPercent)}</Badge>
      </div>
      <Progress className="mt-4 h-2 bg-slate-950" value={safePercent(usage.usedPercent)} />
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
        <span><span className="block font-bold text-slate-200">{formatBytes(usage.usedBytes)}</span>Used</span>
        <span><span className="block font-bold text-slate-200">{formatBytes(usage.usableBytes)}</span>Free</span>
        <span><span className="block font-bold text-slate-200">{formatBytes(usage.totalBytes)}</span>Total</span>
      </div>
    </StorageInset>
  );
}

function AppStorageRow({ app, copied, onCopy, showAdvancedMetrics }: { app: AppStorageUsage; copied: string | null; onCopy: (value: string, id: string) => void; showAdvancedMetrics: boolean }) {
  return (
    <StorageInset className={cn('grid gap-3 p-4 md:items-center', showAdvancedMetrics ? 'md:grid-cols-[minmax(0,1fr)_130px_110px_120px_auto]' : 'md:grid-cols-[minmax(0,1fr)_130px_110px_120px]')}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-white">{app.appName}</p>
          <Badge className="border-slate-700 bg-slate-950 text-slate-300">{app.status}</Badge>
          <Badge className={cn('border', app.backupEnabled ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100' : 'border-orange-400/45 bg-orange-500/10 text-orange-200')}>
            {app.backupEnabled ? `${app.backupFrequency} backup` : 'Backup off'}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">Managed app data</p>
        {showAdvancedMetrics && <p className="mt-1 truncate font-mono text-xs text-slate-600">{app.path}</p>}
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-slate-500">Used</p>
        <p className="mt-1 font-black text-white">{formatBytes(app.usedBytes)}</p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-slate-500">Backups</p>
        <p className="mt-1 text-sm text-slate-300">{app.backupEnabled ? app.backupFrequency : 'Off'}</p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-slate-500">7-day change</p>
        <p className={cn('mt-1 text-sm', app.sevenDayGrowthBytes > 0 ? 'text-orange-200' : 'text-slate-300')}>{growthLabel(app)}</p>
      </div>
      {showAdvancedMetrics && (
        <ProjectDarkControlButton className="w-fit" onClick={() => onCopy(app.path, app.appId)} size="sm" type="button">
          {copied === app.appId ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied === app.appId ? 'Copied' : 'Copy path'}
        </ProjectDarkControlButton>
      )}
      {showAdvancedMetrics && <StorageSparkline app={app} />}
    </StorageInset>
  );
}

function RecommendationCard({ recommendation }: { recommendation: StorageRecommendation }) {
  const Icon = recommendation.tone === 'success' ? CheckCircle2 : recommendation.tone === 'danger' ? AlertTriangle : Info;
  return (
    <div className={cn('rounded-lg border p-4', recommendationTone(recommendation.tone))}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold text-white">{recommendation.title}</p>
          <p className="mt-1 text-sm text-current/80">{shortRecommendation(recommendation)}</p>
        </div>
      </div>
    </div>
  );
}

function OrphanedRow({ onCleanup, orphan, showAdvancedMetrics }: { onCleanup: (orphan: OrphanedStorage) => void; orphan: OrphanedStorage; showAdvancedMetrics: boolean }) {
  return (
    <div className="rounded-lg border border-orange-400/45 bg-orange-500/10 p-3 text-orange-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
        <Trash2 className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-bold text-white">{orphan.name}</p>
          <p className="mt-1 text-xs text-orange-100/70">{formatBytes(orphan.usedBytes)}</p>
          <p className="mt-1 text-xs text-orange-100/60">Not tied to an installed app</p>
          {showAdvancedMetrics && <p className="mt-1 break-all font-mono text-xs text-orange-100/50">{orphan.path}</p>}
        </div>
        </div>
        <ProjectWarningButton onClick={() => onCleanup(orphan)} size="sm" type="button">
          Review
        </ProjectWarningButton>
      </div>
    </div>
  );
}

function CleanupDialog({ confirmation, loading, onChange, onClose, onConfirm, target }: { confirmation: string; loading: boolean; onChange: (value: string) => void; onClose: () => void; onConfirm: () => void; target: OrphanedStorage | null }) {
  const canConfirm = Boolean(target && confirmation === target.name);
  const safetyChecklist = backupSafetyChecklist('storage-cleanup');
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl border-sky-400/30 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Clean up unused app data</DialogTitle>
          <DialogDescription className="text-slate-400">
            {safetyChecklist[0]}
          </DialogDescription>
        </DialogHeader>
        {target && (
          <div className="grid gap-3">
            <FactRow label="Folder" value={target.name} />
            <FactRow label="Path" value={target.path} />
            <FactRow label="Space to recover" value={formatBytes(target.usedBytes)} />
            <div className="rounded-lg border border-orange-400/45 bg-orange-500/10 p-3 text-sm text-orange-200">
              {safetyChecklist[1]}
            </div>
            <label className="text-sm font-semibold text-slate-300" htmlFor="cleanup-confirmation">Type `{target.name}` to confirm</label>
            <Input
              className="border-slate-700 bg-slate-950 text-slate-100 focus:border-emerald-300/50"
              id="cleanup-confirmation"
              onChange={(event) => onChange(event.target.value)}
              value={confirmation}
            />
          </div>
        )}
        <DialogFooter>
          <ProjectDarkControlButton onClick={onClose} type="button">Cancel</ProjectDarkControlButton>
          <DisabledAction disabled={!canConfirm || loading} reason={loading ? 'Autark-OS is already preparing this cleanup.' : 'Type the folder name exactly before cleanup can continue.'}>
            <ProjectWarningButton disabled={!canConfirm || loading} onClick={onConfirm} type="button">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Create checkpoint and remove
            </ProjectWarningButton>
          </DisabledAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StorageSparkline({ app }: { app: AppStorageUsage }) {
  if (app.trend.length < 2) {
    return <p className="text-xs text-slate-500 md:col-span-5">Growth trend appears after a few storage checks.</p>;
  }
  const min = Math.min(...app.trend.map((point) => point.usedBytes));
  const max = Math.max(...app.trend.map((point) => point.usedBytes));
  return (
    <div className="flex h-9 items-end gap-1 md:col-span-5" title="Recent storage samples">
      {app.trend.slice(-18).map((point) => {
        const height = max === min ? 30 : 20 + ((point.usedBytes - min) / (max - min)) * 70;
        return <span className="w-full rounded-t bg-emerald-400/70" key={point.sampledAt} style={{ height: `${height}%` }} />;
      })}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <StorageInset>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-200">{value}</p>
    </StorageInset>
  );
}

function SectionHeader({ compact = false, description, icon: Icon, title }: { compact?: boolean; description?: string; icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('grid place-items-center rounded-lg border border-sky-400/25 bg-slate-800 text-cyan-200', compact ? 'size-9' : 'size-10')}>
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className={cn('font-black text-white', compact ? 'text-lg' : 'text-xl')}>{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
    </div>
  );
}

function SignalCard({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'green' | 'orange' | 'red' | 'slate' | 'cyan'; value: string }) {
  const tones = {
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
    orange: 'border-orange-400/45 bg-orange-500/10 text-orange-200',
    red: 'border-red-400/40 bg-red-500/10 text-red-200',
    slate: 'border-slate-700/60 bg-slate-900/55 text-slate-300',
    cyan: 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100',
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

function EmptyState({ compact = false, message, title }: { compact?: boolean; message: string; title: string }) {
  return <ProjectInlineEmptyState compact={compact} description={message} title={title} />;
}

function StorageLoadingState() {
  return (
    <PageShell>
      <Surface className="grid min-h-[520px] place-items-center p-8 text-center" tone="panel">
        <div className="grid justify-items-center gap-3">
          <span className="grid size-12 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-100">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <div>
            <p className="font-black text-white">Checking storage</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-sky-100/80">Reading disk space, app data, backups, and cleanup candidates.</p>
          </div>
        </div>
      </Surface>
    </PageShell>
  );
}

function StorageErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border-b border-red-400/40 bg-red-500/10 px-6 py-4 text-red-100">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-current">Storage data could not refresh</p>
          <p className="mt-1 text-sm leading-6 text-current/80">{message}</p>
          <ProjectDarkControlButton className="mt-3 border-red-300/30 text-red-100 hover:bg-red-500/20" onClick={onRetry} size="sm" type="button">
            Try again
          </ProjectDarkControlButton>
        </div>
      </div>
    </div>
  );
}

function getStorageHero(report: StorageReport | null) {
  if (!report) {
    return {
      action: 'Storage data is unavailable.',
      summary: 'Autark-OS could not read disk usage yet. Refresh the page or check Support if this continues.',
      title: 'Storage status is unknown',
    };
  }
  if (report.status === 'critical') {
    return {
      action: 'Free up space before installing more apps.',
      summary: report.summary || 'Free space is critically low. Review large apps and unused data before adding anything new.',
      title: 'Storage needs attention now',
    };
  }
  if (report.status === 'warning') {
    return {
      action: 'Review growth and cleanup candidates.',
      summary: report.summary || 'There is still usable room, but storage is getting tight enough to review app data and backups.',
      title: 'Storage is getting tight',
    };
  }
  return {
    action: 'No cleanup needed right now.',
    summary: report.summary || 'You have plenty of room for apps, backups, and normal growth.',
    title: 'You have plenty of room',
  };
}

function statusIcon(status?: string) {
  if (status === 'healthy') return CheckCircle2;
  if (status === 'critical') return AlertTriangle;
  return Info;
}

function statusTone(status?: string): 'green' | 'orange' | 'red' | 'slate' | 'cyan' {
  if (status === 'healthy') return 'green';
  if (status === 'critical') return 'red';
  if (status === 'warning') return 'orange';
  return 'cyan';
}

function usageTone(value?: number): 'green' | 'orange' | 'red' | 'slate' | 'cyan' {
  if (value == null || value < 0) return 'slate';
  if (value >= 90) return 'red';
  if (value >= 75) return 'orange';
  return 'green';
}

function usageBadgeTone(value: number) {
  if (value >= 90) return 'border-red-400/40 bg-red-500/10 text-red-200';
  if (value >= 75) return 'border-orange-400/45 bg-orange-500/10 text-orange-200';
  return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
}

function recommendationTone(tone: string) {
  if (tone === 'success') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  if (tone === 'danger') return 'border-red-400/40 bg-red-500/10 text-red-200';
  if (tone === 'warning') return 'border-orange-400/45 bg-orange-500/10 text-orange-200';
  return 'border-sky-400/25 bg-slate-800 text-slate-300';
}

function shortRecommendation(recommendation: StorageRecommendation) {
  if (recommendation.id === 'disk-healthy') return 'Enough space for normal use.';
  if (recommendation.id === 'disk-warning') return 'Free space is getting low.';
  if (recommendation.id === 'disk-critical') return 'Free space is critically low.';
  if (recommendation.id === 'orphaned-data') return 'Review unused folders before cleanup is added.';
  if (recommendation.id === 'backups-empty') return 'No backup files yet.';
  if (recommendation.id === 'backup-disabled') return 'Some apps have backups off.';
  return recommendation.message;
}

function locationLabel(title: string) {
  if (title === 'Host disk') return 'This computer';
  if (title === 'Autark-OS data') return 'Managed app data';
  if (title === 'Backups') return 'Backup folder';
  return 'Managed location';
}

function growthLabel(app: AppStorageUsage) {
  if (app.trend.length < 2) return 'Collecting';
  if (app.sevenDayGrowthBytes === 0) return 'No change';
  const sign = app.sevenDayGrowthBytes > 0 ? '+' : '-';
  return `${sign}${formatBytes(Math.abs(app.sevenDayGrowthBytes))}`;
}

function percentLabel(value?: number | null) {
  if (value == null || value < 0) return 'Unknown';
  return `${Math.round(value)}%`;
}

function safePercent(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

export default StoragePage;
