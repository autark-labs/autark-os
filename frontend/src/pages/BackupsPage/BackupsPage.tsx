import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, AppWindow, Archive, Boxes, CalendarClock, CheckCircle2, Clock3, DatabaseBackup, HardDrive, Layers3, Loader2, Play, RotateCcw, ShieldCheck, Sparkles, TimerReset } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell, SurfaceFrame, SurfaceInset, SurfacePanel } from '@/components/project-os/ProjectOSComponents';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { AppBackupStatus, BackupReport, RestorePlan, RestorePoint } from '@/types/backup';

type RestoreView = 'timeline' | 'list';

function BackupsPage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const [report, setReport] = useState<BackupReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [restorePlan, setRestorePlan] = useState<RestorePlan | null>(null);
  const [restorePoint, setRestorePoint] = useState<RestorePoint | null>(null);
  const [restoreTargetAppId, setRestoreTargetAppId] = useState<string | null>(null);
  const [restoreView, setRestoreView] = useState<RestoreView>('timeline');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(background = false) {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      setReport(await BackupAPIClient.report());
      setUpdatedAt(new Date());
    } catch (loadError) {
      setError(apiErrorMessage(loadError, 'Backup status could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (restorePoint || running) {
      return undefined;
    }
    const interval = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(interval);
  }, [restorePoint, running]);

  async function runManualAppBackup(app: AppBackupStatus) {
    await runBackup(`app-${app.appId}`, () => BackupAPIClient.run(app.appId));
  }

  async function runFullBackup() {
    await runBackup('full', () => BackupAPIClient.runFull());
  }

  async function runRoutineBackup() {
    await runBackup('routine', () => BackupAPIClient.runRoutine());
  }

  async function runBackup(id: string, action: () => Promise<{ status: string; message: string }>) {
    setRunning(id);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      if (result.status !== 'completed') {
        setError(result.message);
      } else {
        setMessage(result.message);
      }
      await load(true);
    } catch (runError) {
      setError(apiErrorMessage(runError, 'Backup could not be started.'));
    } finally {
      setRunning(null);
    }
  }

  async function openRestore(point: RestorePoint, appId?: string | null) {
    setError(null);
    setRestorePoint(point);
    setRestoreTargetAppId(appId || null);
    try {
      setRestorePlan(await BackupAPIClient.restorePlan(point.id, appId));
    } catch (planError) {
      setRestorePoint(null);
      setRestorePlan(null);
      setError(apiErrorMessage(planError, 'Restore plan could not be loaded.'));
    }
  }

  async function executeRestore() {
    if (!restorePoint || !restorePlan) {
      return;
    }
    setRunning(`restore-${restorePoint.id}`);
    setError(null);
    setMessage(null);
    try {
      const result = await BackupAPIClient.restore(restorePoint.id, restoreTargetAppId);
      setMessage(result.message);
      setRestorePoint(null);
      setRestorePlan(null);
      await load(true);
    } catch (restoreError) {
      setError(apiErrorMessage(restoreError, 'Restore could not be completed.'));
    } finally {
      setRunning(null);
    }
  }

  async function verifyRestorePoint(point: RestorePoint) {
    setRunning(`verify-${point.id}`);
    setError(null);
    setMessage(null);
    try {
      const result = await BackupAPIClient.verify(point.id);
      setMessage(result.message);
      await load(true);
    } catch (verifyError) {
      setError(apiErrorMessage(verifyError, 'Backup verification could not be completed.'));
    } finally {
      setRunning(null);
    }
  }

  const needsAttention = useMemo(() => report?.apps.filter((app) => app.status !== 'protected') ?? [], [report]);
  const routineRestorePoints = useMemo(() => report?.recentRestorePoints.filter((point) => point.scope === 'full' && point.source === 'automatic' && point.status === 'completed') ?? [], [report]);
  const fullRestorePoints = useMemo(() => report?.recentRestorePoints.filter((point) => point.scope === 'full' && point.status === 'completed') ?? [], [report]);
  const appRestorePoints = useMemo(() => report?.recentRestorePoints.filter((point) => point.scope !== 'full' && point.status === 'completed') ?? [], [report]);
  const latestRestore = report?.recentRestorePoints.find((point) => point.status === 'completed') ?? null;
  const protectionHero = getProtectionHero(report, latestRestore);

  if (loading) {
    return (
      <PageLoadingState label="Checking backups" sublabel="Loading protection status, restore points, and app backup coverage." />
    );
  }

  return (
    <PageShell className="po-page-tall">
      <SurfaceFrame as="header">
        <div className="grid gap-5 border-b border-white/10 bg-po-hero-backups p-6 md:p-7 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-violet-300">Backups</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-white md:text-5xl">{protectionHero.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">{protectionHero.summary}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button className="bg-violet-600 text-white hover:bg-violet-500" disabled={running === 'routine' || !report?.settings.automaticBackupsEnabled} onClick={() => void runRoutineBackup()} type="button">
                {running === 'routine' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Run routine backup
              </Button>
              <Button className="border-violet-300/30 bg-slate-950/50 text-violet-100 hover:bg-slate-900" disabled={running === 'full'} onClick={() => void runFullBackup()} type="button" variant="outline">
                {running === 'full' ? <Loader2 className="size-4 animate-spin" /> : <Layers3 className="size-4" />}
                Full checkpoint
              </Button>
              <RefreshStatus intervalLabel={restorePoint || running ? 'Auto-update paused' : 'Auto-updates every 30s'} onRefresh={() => void load(true)} refreshing={refreshing} updatedAt={updatedAt} />
            </div>
          </div>
          <ProtectionPanel latestRestore={latestRestore} report={report} />
        </div>

        {error && <PageErrorState className="rounded-none border-x-0 border-t-0 px-6 py-4" message={error} onRetry={() => void load(true)} title="Backup status could not refresh" />}
        {message && <div className="border-b border-emerald-300/20 bg-emerald-500/10 px-6 py-4 text-sm text-emerald-100">{message}</div>}
      </SurfaceFrame>

      {report && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <SurfacePanel>
              <SectionHeader icon={DatabaseBackup} title="Create a manual backup" description="Choose the smallest backup that matches what you are about to do." />
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <ActionCard
                  busy={running === 'full'}
                  description="One restore point for every supported installed app."
                  icon={Layers3}
                  label="Full checkpoint"
                  onClick={() => void runFullBackup()}
                  title="Back up everything"
                  tone="violet"
                />
                <ActionCard
                  busy={false}
                  description="Use an app card below when you only need one app."
                  icon={AppWindow}
                  label={`${report.apps.length} apps available`}
                  onClick={() => {
                    document.getElementById('app-backups')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  title="Back up one app"
                  tone="sky"
                />
                <ActionCard
                  busy={running === 'routine'}
                  description={report.settings.automaticBackupsEnabled ? `${capitalize(report.settings.frequency)} near ${report.settings.backupTime}` : 'Turn on routine backups in Settings.'}
                  disabled={!report.settings.automaticBackupsEnabled}
                  icon={CalendarClock}
                  label="Routine path"
                  onClick={() => void runRoutineBackup()}
                  title="Run routine now"
                  tone="emerald"
                />
              </div>
            </SurfacePanel>

            <RoutineHealthPanel report={report} showAdvancedMetrics={showAdvancedMetrics} />

            <SurfacePanel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionHeader icon={RotateCcw} title="Restore" description="Browse restore points as a visual routine timeline or a compact list." />
                <Tabs className="w-fit" onValueChange={(value) => setRestoreView(value as RestoreView)} value={restoreView}>
                  <TabsList className="border border-slate-800 bg-slate-900/80">
                    <TabsTrigger className="px-3 text-slate-400 data-active:text-white" value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger className="px-3 text-slate-400 data-active:text-white" value="list">List</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="mt-5">
                {restoreView === 'timeline' ? (
                  <RoutineTimeline apps={report.apps} latestRestore={latestRestore} nextRun={report.settings.nextRoutineRun} onRestore={openRestore} onVerify={verifyRestorePoint} points={routineRestorePoints} running={running} />
                ) : (
                  <RestoreList apps={report.apps} appRestorePoints={appRestorePoints} fullRestorePoints={fullRestorePoints} onRestore={openRestore} onVerify={verifyRestorePoint} running={running} />
                )}
              </div>
            </SurfacePanel>

            <SurfacePanel id="app-backups">
              <SectionHeader icon={Boxes} title="App backups" description="Create a focused backup for a specific app." />
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {report.apps.length ? report.apps.map((app) => (
                  <AppBackupCard app={app} key={app.appId} onRun={runManualAppBackup} running={running === `app-${app.appId}`} showAdvancedMetrics={showAdvancedMetrics} />
                )) : (
                  <EmptyState title="No apps installed" message="Install apps to begin backup protection." />
                )}
              </div>
            </SurfacePanel>
          </div>

          <aside className="space-y-5">
            <SurfacePanel>
              <SectionHeader compact icon={HardDrive} title="Storage" />
              <div className="mt-4 grid gap-3">
                <FactRow label="Used" value={formatBytes(report.backupStorageBytes)} />
                <FactRow label="Restore points" value={`${report.recentRestorePoints.length}`} />
                <FactRow label="Protected apps" value={`${report.protectedApps}/${report.totalApps}`} />
                {showAdvancedMetrics && <FactRow label="Backup folder" value={report.backupRoot} />}
              </div>
            </SurfacePanel>

            <SurfacePanel>
              <SectionHeader compact icon={AlertTriangle} title="Needs attention" />
              <div className="mt-4 grid gap-3">
                {needsAttention.length ? needsAttention.map((app) => <AttentionCard app={app} key={app.appId} />) : <EmptyState compact title="All protected" message="Installed apps have backup protection enabled." />}
              </div>
            </SurfacePanel>
          </aside>
        </div>
      )}

      <RestoreDialog
        appOptions={report?.apps ?? []}
        loading={running === `restore-${restorePoint?.id}`}
        onClose={() => {
          setRestorePoint(null);
          setRestorePlan(null);
          setRestoreTargetAppId(null);
        }}
        onRestore={() => void executeRestore()}
        onTargetChange={(appId) => restorePoint && void openRestore(restorePoint, appId)}
        plan={restorePlan}
        point={restorePoint}
        targetAppId={restoreTargetAppId}
        showAdvancedMetrics={showAdvancedMetrics}
      />
    </PageShell>
  );
}

function ProtectionPanel({ latestRestore, report }: { latestRestore: RestorePoint | null; report: BackupReport | null }) {
  const protectedPercent = report?.totalApps ? Math.round((report.protectedApps / report.totalApps) * 100) : 0;
  return (
    <SurfacePanel className="bg-slate-950/55 shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{report?.settings.automaticBackupsEnabled ? 'Routine protection on' : 'Routine protection off'}</p>
          <p className="mt-1 text-xs text-slate-400">{report?.settings.nextRunLabel || 'Schedule unavailable'}</p>
        </div>
        <span className={cn('grid size-11 place-items-center rounded-lg border', report?.settings.automaticBackupsEnabled ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200' : 'border-amber-300/20 bg-amber-500/10 text-amber-100')}>
          <ShieldCheck className="size-5" />
        </span>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Protected apps</span>
          <span>{report?.protectedApps ?? 0}/{report?.totalApps ?? 0}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400" style={{ width: `${protectedPercent}%` }} />
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <MiniStat icon={Archive} label="Restore points" value={`${report?.recentRestorePoints.length ?? 0}`} />
        <MiniStat icon={Clock3} label="Latest" value={latestRestore ? formatDate(latestRestore.createdAt) : 'None'} />
      </div>
    </SurfacePanel>
  );
}

function RoutineHealthPanel({ report, showAdvancedMetrics }: { report: BackupReport; showAdvancedMetrics: boolean }) {
  const tone = schedulerTone(report.settings.schedulerHealth);
  return (
    <SurfacePanel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader icon={TimerReset} title="Protection rhythm" description="Last good checkpoint, next scheduled run, and current scheduler status." />
        <Badge className={cn('border', tone)}>{schedulerLabel(report.settings.schedulerHealth)}</Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <FactRow label="Last successful backup" value={report.settings.lastSuccessfulRoutineRun ? formatDate(report.settings.lastSuccessfulRoutineRun.createdAt) : 'None yet'} />
        <FactRow label="Next scheduled backup" value={report.settings.nextRoutineRun ? formatDate(report.settings.nextRoutineRun) : 'Not scheduled'} />
        <FactRow label="Protected apps" value={`${report.protectedApps}/${report.totalApps}`} />
      </div>
      <SurfaceInset className="mt-4 text-sm leading-6 text-slate-300">{report.settings.schedulerMessage}</SurfaceInset>
      {showAdvancedMetrics && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <FactRow label="Last routine run" value={report.settings.lastRoutineRun ? `${statusLabel(report.settings.lastRoutineRun.status)} · ${formatDate(report.settings.lastRoutineRun.createdAt)}` : 'No routine run yet'} />
          <FactRow label="Last verified" value={report.settings.lastSuccessfulVerification ? formatDate(report.settings.lastSuccessfulVerification.verifiedAt || report.settings.lastSuccessfulVerification.createdAt) : 'None yet'} />
        </div>
      )}
    </SurfacePanel>
  );
}

function ActionCard({ busy, description, disabled = false, icon: Icon, label, onClick, title, tone }: { busy: boolean; description: string; disabled?: boolean; icon: LucideIcon; label: string; onClick: () => void; title: string; tone: 'violet' | 'sky' | 'emerald' }) {
  const tones = {
    violet: 'border-violet-300/20 bg-violet-500/10 text-violet-100',
    sky: 'border-sky-300/20 bg-sky-500/10 text-sky-100',
    emerald: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
  };
  return (
    <button className={cn('group rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-50', tones[tone])} disabled={busy || disabled} onClick={onClick} type="button">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-lg border border-white/10 bg-slate-950/55 text-white">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
        </span>
        <Badge className="border-white/10 bg-slate-950/60 text-current">{label}</Badge>
      </div>
      <p className="mt-4 font-black text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-current/75">{description}</p>
    </button>
  );
}

function RoutineTimeline({ apps, latestRestore, nextRun, onRestore, onVerify, points, running }: { apps: AppBackupStatus[]; latestRestore: RestorePoint | null; nextRun: string | null; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; points: RestorePoint[]; running: string | null }) {
  if (!points.length) {
    return <EmptyState title="No routine restore points yet" message="Run a routine backup to create the first visual timeline point." />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/35 p-4">
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <TimelineSummary icon={CheckCircle2} label="Last successful backup" value={latestRestore ? formatDate(latestRestore.createdAt) : 'None yet'} />
        <TimelineSummary icon={CalendarClock} label="Next scheduled backup" value={nextRun ? formatDate(nextRun) : 'Not scheduled'} />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {points.map((point, index) => (
          <TimelinePoint apps={apps} first={index === 0} key={point.id} onRestore={onRestore} onVerify={onVerify} point={point} running={running === `verify-${point.id}`} />
        ))}
      </div>
    </div>
  );
}

function TimelinePoint({ apps, first, onRestore, onVerify, point, running }: { apps: AppBackupStatus[]; first: boolean; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; point: RestorePoint; running: boolean }) {
  const included = point.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean);
  const eligibleApps = apps.filter((app) => included.includes(app.appId));
  return (
    <div className="relative min-w-[260px]">
      {!first && <span className="absolute left-[-1rem] top-7 h-px w-4 bg-violet-400/40" />}
      <div className="rounded-lg border border-violet-300/20 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="grid size-12 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-sky-500 text-white shadow-po-brand-glow">
            <Archive className="size-5" />
          </span>
          <Badge className="border-sky-300/20 bg-sky-500/10 text-sky-100">Routine</Badge>
        </div>
        <p className="mt-4 text-lg font-black text-white">{formatDate(point.createdAt)}</p>
        <p className="mt-1 text-xs text-slate-500">{formatBytes(point.sizeBytes)} stored</p>
        <VerificationBadge point={point} />
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Sparkles className="size-3.5 text-violet-300" />
          {eligibleApps.length} app{eligibleApps.length === 1 ? '' : 's'} included
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => onRestore(point, null)} size="sm" type="button">
            Restore all
          </Button>
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={!eligibleApps.length} onClick={() => onRestore(point, eligibleApps[0]?.appId || null)} size="sm" type="button" variant="outline">
            One app
          </Button>
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={running} onClick={() => onVerify(point)} size="sm" type="button" variant="outline">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            Verify
          </Button>
        </div>
      </div>
    </div>
  );
}

function RestoreList({ apps, appRestorePoints, fullRestorePoints, onRestore, onVerify, running }: { apps: AppBackupStatus[]; appRestorePoints: RestorePoint[]; fullRestorePoints: RestorePoint[]; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; running: string | null }) {
  const allPoints = [...fullRestorePoints, ...appRestorePoints].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!allPoints.length) {
    return <EmptyState title="No restore points yet" message="Run a routine or manual backup to create the first restore point." />;
  }
  return (
    <div className="grid gap-3">
      {allPoints.map((point) => <RestorePointRow apps={apps} key={point.id} onRestore={onRestore} onVerify={onVerify} point={point} running={running === `verify-${point.id}`} />)}
    </div>
  );
}

function AppBackupCard({ app, onRun, running, showAdvancedMetrics }: { app: AppBackupStatus; onRun: (app: AppBackupStatus) => void; running: boolean; showAdvancedMetrics: boolean }) {
  return (
    <SurfaceInset className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-white">{app.appName}</p>
            <Badge className={cn('border', appBadgeTone(app.status))}>{statusLabel(app.status)}</Badge>
            {app.backupContract.reviewRequired && <Badge className="border-amber-300/20 bg-amber-500/10 text-amber-100">Review</Badge>}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{app.message}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-950/60 text-slate-400">
          <AppWindow className="size-4" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Data" value={formatBytes(app.dataSizeBytes)} />
        <Metric label="Latest" value={app.latestBackup ? formatDate(app.latestBackup.createdAt) : 'None'} />
      </div>
      {showAdvancedMetrics && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/45 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Backup contract</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">{app.backupContract.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{app.backupContract.summary}</p>
        </div>
      )}
      <Button className="mt-4 w-full border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={running || app.status === 'unprotected'} onClick={() => onRun(app)} size="sm" type="button" variant="outline">
        {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
        {running ? 'Running' : 'Back up app'}
      </Button>
    </SurfaceInset>
  );
}

function RestorePointRow({ apps, onRestore, onVerify, point, running }: { apps: AppBackupStatus[]; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; point: RestorePoint; running: boolean }) {
  const included = point.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean);
  const eligibleApps = point.scope === 'full' ? apps.filter((app) => included.includes(app.appId)) : apps.filter((app) => app.appId === point.appId);
  return (
    <SurfaceInset className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_120px_130px_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-white">{point.scope === 'full' ? 'Full backup' : point.appName}</p>
          <Badge className={cn('border', point.source === 'automatic' ? 'border-sky-300/20 bg-sky-500/10 text-sky-100' : 'border-violet-300/20 bg-violet-500/10 text-violet-100')}>{point.source}</Badge>
          <Badge className="border-slate-700 bg-slate-950 text-slate-300">{point.scope}</Badge>
          <VerificationBadge point={point} />
        </div>
        <p className="mt-1 text-xs text-slate-500">{point.message}</p>
      </div>
      <Metric label="Size" value={formatBytes(point.sizeBytes)} />
      <Metric label="Created" value={formatDate(point.createdAt)} />
      <div className="flex flex-wrap gap-2 xl:justify-end">
        {point.scope === 'full' && (
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onRestore(point, null)} size="sm" type="button" variant="outline">
            Restore all
          </Button>
        )}
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={!eligibleApps.length} onClick={() => onRestore(point, eligibleApps[0]?.appId || null)} size="sm" type="button" variant="outline">
          Restore app
        </Button>
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={running} onClick={() => onVerify(point)} size="sm" type="button" variant="outline">
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
          Verify
        </Button>
      </div>
    </SurfaceInset>
  );
}

function VerificationBadge({ point }: { point: RestorePoint }) {
  const status = point.verificationStatus || 'not_checked';
  const tone = status === 'verified'
    ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
    : status === 'failed'
      ? 'border-red-300/20 bg-red-500/10 text-red-100'
      : 'border-amber-300/20 bg-amber-500/10 text-amber-100';
  const label = status === 'verified' ? `Verified · ${capitalize(point.restoreConfidence || 'unknown')}` : status === 'failed' ? 'Verification failed' : 'Not verified';
  return <Badge className={tone}>{label}</Badge>;
}

function RestoreDialog({ appOptions, loading, onClose, onRestore, onTargetChange, plan, point, showAdvancedMetrics, targetAppId }: { appOptions: AppBackupStatus[]; loading: boolean; onClose: () => void; onRestore: () => void; onTargetChange: (appId: string | null) => void; plan: RestorePlan | null; point: RestorePoint | null; showAdvancedMetrics: boolean; targetAppId: string | null }) {
  const open = Boolean(point);
  const included = point?.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
  const selectableApps = point?.scope === 'full' ? appOptions.filter((app) => included.includes(app.appId)) : appOptions.filter((app) => app.appId === point?.appId);
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl border-white/10 bg-slate-950 text-slate-100">
        <DialogHeader>
          <DialogTitle>{plan?.title || 'Restore backup'}</DialogTitle>
          <DialogDescription className="text-slate-400">{plan?.summary || 'Review what Project OS will restore before continuing.'}</DialogDescription>
        </DialogHeader>
        {point?.scope === 'full' && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            <label className="text-xs font-bold uppercase text-slate-500" htmlFor="restore-target">Restore target</label>
            <select className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-slate-100" id="restore-target" onChange={(event) => onTargetChange(event.target.value || null)} value={targetAppId || ''}>
              <option value="">Everything in this full backup</option>
              {selectableApps.map((app) => <option key={app.appId} value={app.appId}>{app.appName} only</option>)}
            </select>
          </div>
        )}
        {plan && (
          <div className="grid gap-4">
            <InfoBlock title="Affected apps" values={plan.affectedApps.length ? plan.affectedApps : ['No installed app matches this restore point.']} />
            {plan.warnings.length > 0 && <InfoBlock tone="warning" title="Important warnings" values={plan.warnings} />}
            {showAdvancedMetrics && (
              <>
                <InfoBlock title="Archive verification" values={[`${plan.restoreConfidence}: ${plan.verificationMessage || 'No verification details recorded yet.'}`]} />
                <InfoBlock tone={plan.simulation.status === 'failed' || plan.simulation.status === 'warning' ? 'warning' : 'default'} title="Restore simulation" values={[plan.simulation.message, ...plan.simulation.details]} />
                <InfoBlock title="Steps Project OS will take" values={plan.steps} />
                <InfoBlock title="Backup contract check" values={plan.dryRunDetails.length ? plan.dryRunDetails : ['No app-specific backup contract details were found.']} />
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button className="bg-violet-600 text-white hover:bg-violet-500" disabled={!plan?.executable || loading} onClick={onRestore} type="button">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <SurfaceInset>
      <Icon className="size-4 text-slate-500" />
      <p className="mt-2 text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</p>
    </SurfaceInset>
  );
}

function TimelineSummary({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-3">
      <span className="grid size-9 place-items-center rounded-lg border border-violet-300/20 bg-violet-500/10 text-violet-200">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold uppercase text-slate-500">{label}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-white">{value}</span>
      </span>
    </div>
  );
}

function InfoBlock({ title, tone = 'default', values }: { title: string; tone?: 'default' | 'warning'; values: string[] }) {
  return (
    <div className={cn('rounded-lg border p-3', tone === 'warning' ? 'border-amber-300/20 bg-amber-500/10 text-amber-100' : 'border-slate-800 bg-slate-900/45 text-slate-300')}>
      <p className="text-sm font-bold text-white">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {values.map((value) => <li key={value}>{value}</li>)}
      </ul>
    </div>
  );
}

function AttentionCard({ app }: { app: AppBackupStatus }) {
  return (
    <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-4 text-amber-100">
      <p className="font-bold text-white">{app.appName}</p>
      <p className="mt-1 text-sm text-amber-100/80">{app.message}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceInset>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-200">{value}</p>
    </SurfaceInset>
  );
}

function SectionHeader({ compact = false, description, icon: Icon, title }: { compact?: boolean; description?: string; icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('grid place-items-center rounded-lg border border-white/10 bg-slate-900 text-violet-300', compact ? 'size-9' : 'size-10')}>
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className={cn('font-black text-white', compact ? 'text-lg' : 'text-xl')}>{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
    </div>
  );
}

function EmptyState({ compact = false, message, title }: { compact?: boolean; message: string; title: string }) {
  return (
    <div className={cn('rounded-lg border border-slate-800 bg-slate-900/40 text-center', compact ? 'p-4' : 'p-8')}>
      <p className="font-bold text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
    </div>
  );
}

function getProtectionHero(report: BackupReport | null, latestRestore: RestorePoint | null) {
  if (!report) {
    return {
      summary: 'Project OS could not read backup status yet. Refresh the page or check Support if this continues.',
      title: 'Protection status is unknown',
    };
  }
  if (report.status === 'protected') {
    return {
      summary: latestRestore
        ? `Your apps have backup protection. The latest restore point was created ${formatDate(latestRestore.createdAt)}, and the next scheduled backup is ${report.settings.nextRoutineRun ? formatDate(report.settings.nextRoutineRun) : 'not scheduled'}.`
        : 'Your apps are configured for protection. Run a routine backup to create the first restore point.',
      title: 'Your data is protected',
    };
  }
  if (report.failedBackups > 0) {
    return {
      summary: `${report.failedBackups} backup ${report.failedBackups === 1 ? 'run needs' : 'runs need'} attention. Review the affected apps and create a fresh checkpoint after fixing the issue.`,
      title: 'Backup protection needs attention',
    };
  }
  return {
    summary: report.summary || 'Some apps still need a successful backup before Project OS can call them protected.',
    title: 'Finish backup protection',
  };
}

function appBadgeTone(status: string) {
  if (status === 'protected') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  if (status === 'failed') return 'border-red-300/20 bg-red-500/10 text-red-100';
  return 'border-amber-300/20 bg-amber-500/10 text-amber-100';
}

function statusLabel(status: string) {
  if (status === 'manual_only') return 'Manual run required';
  if (status === 'needs_backup_review') return 'Needs backup review';
  if (status === 'not_backed_up') return 'No backup yet';
  return status.replaceAll('_', ' ');
}

function schedulerLabel(status: string) {
  if (status === 'off') return 'Off';
  if (status === 'manual_only') return 'Run-now mode';
  if (status === 'warning') return 'Needs attention';
  if (status === 'healthy') return 'Healthy';
  return statusLabel(status);
}

function schedulerTone(status: string) {
  if (status === 'healthy') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  if (status === 'warning') return 'border-red-300/20 bg-red-500/10 text-red-100';
  if (status === 'off') return 'border-slate-700 bg-slate-900 text-slate-300';
  return 'border-amber-300/20 bg-amber-500/10 text-amber-100';
}

function formatDate(value?: string | null) {
  if (!value) return 'None';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
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

function capitalize(value: string) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : value;
}

export default BackupsPage;
