import { useEffect, useState } from 'react';
import { AlertTriangle, AppWindow, Boxes, CalendarClock, DatabaseBackup, HardDrive, Layers3, Loader2, Play, RotateCcw } from 'lucide-react';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell, SurfaceFrame, SurfacePanel } from '@/components/project-os/ProjectOSComponents';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AppBackupStatus, BackupReport, RestorePlan, RestorePoint } from '@/types/backup';
import {
  ActionCard,
  AppBackupCard,
  AttentionCard,
  EmptyState,
  FactRow,
  ProtectionPanel,
  RestoreDialog,
  RestoreList,
  RestorePointDetailsDialog,
  RoutineHealthPanel,
  RoutineTimeline,
  SectionHeader,
} from './BackupsPage.components';
import { backupPageViewModel, capitalizeBackupLabel, formatBackupBytes } from './BackupsPage.logic';

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
  const [detailPlan, setDetailPlan] = useState<RestorePlan | null>(null);
  const [detailPoint, setDetailPoint] = useState<RestorePoint | null>(null);
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

  async function openRestorePointDetails(point: RestorePoint) {
    setError(null);
    setDetailPoint(point);
    setDetailPlan(null);
    try {
      setDetailPlan(await BackupAPIClient.restorePlan(point.id));
    } catch (planError) {
      console.warn('Restore detail plan could not be loaded.', planError);
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

  const {
    appRestorePoints,
    fullRestorePoints,
    latestRestore,
    needsAttention,
    protectionHero,
    routineRestorePoints,
  } = backupPageViewModel(report) as {
    appRestorePoints: RestorePoint[];
    fullRestorePoints: RestorePoint[];
    latestRestore: RestorePoint | null;
    needsAttention: AppBackupStatus[];
    protectionHero: { summary: string; title: string };
    routineRestorePoints: RestorePoint[];
  };

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
              <h1 className="mt-2 text-3xl font-black leading-tight text-white md:text-4xl">{protectionHero.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">{protectionHero.summary}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button className="bg-violet-600 text-white hover:bg-violet-500" disabled={running === 'routine' || !report?.settings.automaticBackupsEnabled} onClick={() => void runRoutineBackup()} type="button">
                {running === 'routine' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Run routine backup
              </Button>
              {showAdvancedMetrics && <Button className="border-violet-300/30 bg-slate-950/50 text-violet-100 hover:bg-slate-900" disabled={running === 'full'} onClick={() => void runFullBackup()} type="button" variant="outline">
                {running === 'full' ? <Loader2 className="size-4 animate-spin" /> : <Layers3 className="size-4" />}
                Full checkpoint
              </Button>}
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
                {showAdvancedMetrics && <ActionCard
                  busy={running === 'full'}
                  description="One restore point for every supported installed app."
                  icon={Layers3}
                  label="Full checkpoint"
                  onClick={() => void runFullBackup()}
                  title="Back up everything"
                  tone="violet"
                />}
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
                  description={report.settings.automaticBackupsEnabled ? `${capitalizeBackupLabel(report.settings.frequency)} near ${report.settings.backupTime}` : 'Turn on routine backups in Settings.'}
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
                  <RoutineTimeline apps={report.apps} latestRestore={latestRestore} nextRun={report.settings.nextRoutineRun} onDetails={openRestorePointDetails} onRestore={openRestore} onVerify={verifyRestorePoint} points={routineRestorePoints} running={running} />
                ) : (
                  <RestoreList apps={report.apps} appRestorePoints={appRestorePoints} fullRestorePoints={fullRestorePoints} onDetails={openRestorePointDetails} onRestore={openRestore} onVerify={verifyRestorePoint} running={running} />
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
                <FactRow label="Used" value={formatBackupBytes(report.backupStorageBytes)} />
                <FactRow label="Restore points" value={`${report.recentRestorePoints.length}`} />
                <FactRow label="Protected apps" value={`${report.protectedApps}/${report.totalApps}`} />
                {showAdvancedMetrics && <FactRow label="Backup folder" value={report.backupRoot} />}
              </div>
            </SurfacePanel>

            <SurfacePanel>
              <SectionHeader compact icon={AlertTriangle} title="Needs attention" />
              <div className="mt-4 grid gap-3">
                {needsAttention.length ? needsAttention.map((app) => <AttentionCard app={app} key={app.appId} />) : <EmptyState compact title={report.totalApps ? 'All protected' : 'No apps installed'} message={report.totalApps ? 'Installed apps have backup protection enabled.' : 'Install an app before backup protection can begin.'} />}
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
      <RestorePointDetailsDialog
        apps={report?.apps ?? []}
        onClose={() => {
          setDetailPoint(null);
          setDetailPlan(null);
        }}
        onRestore={(point) => void openRestore(point, null)}
        onVerify={(point) => void verifyRestorePoint(point)}
        plan={detailPlan}
        point={detailPoint}
        running={running}
      />
    </PageShell>
  );
}

export default BackupsPage;
