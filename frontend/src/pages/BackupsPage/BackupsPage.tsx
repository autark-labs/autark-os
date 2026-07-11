import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, AppWindow, Boxes, CalendarClock, DatabaseBackup, HardDrive, Layers3, Loader2, Play, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@/api/httpClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { CanonicalRecommendedAction } from '@/components/autark-os/CanonicalRecommendedAction';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectInlineEmptyState as EmptyState } from '@/components/primitives/EmptyState';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { Surface } from '@/components/primitives/Surface';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { showActionNotification, showJobNotification } from '@/lib/actionNotifications';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useBackupReportRepository,
  useBackupJobsQuery,
  useAutarkOsJobQuery,
  useRestoreBackupMutation,
  useRestorePlanMutation,
  useRunAppBackupMutation,
  useRunFullBackupMutation,
  useRunRoutineBackupMutation,
  useVerifyRestorePointMutation,
} from '@/repositories/backupRepository';
import { terminalJob } from '@/repositories/jobRepository';
import {
  invalidateApplicationState,
  setAutarkOsJobInApplicationStateCache,
} from '@/repositories/applicationStateRepository';
import type { AppBackupStatus, RestorePlan, RestorePoint } from '@/types/backup';
import type { AutarkOsJob } from '@/types/jobs';
import {
  ActionCard,
  AppBackupCard,
  BackupPanel,
  AttentionCard,
  FactRow,
  ProtectionPanel,
  RestoreDialog,
  RestoreList,
  RestorePointDetailsDialog,
  RoutineHealthPanel,
  RoutineTimeline,
  SectionHeader,
} from './BackupsPage.components';
import { backupJobRunningId, backupPageViewModel, capitalizeBackupLabel, formatBackupBytes, selectActiveBackupJob } from './BackupsPage.logic';

type RestoreView = 'timeline' | 'list';

function BackupsPage() {
  const queryClient = useQueryClient();
  const { showAdvancedMetrics } = useProjectSettings();
  const [running, setRunning] = useState<string | null>(null);
  const [restorePlan, setRestorePlan] = useState<RestorePlan | null>(null);
  const [restorePoint, setRestorePoint] = useState<RestorePoint | null>(null);
  const [detailPlan, setDetailPlan] = useState<RestorePlan | null>(null);
  const [detailPoint, setDetailPoint] = useState<RestorePoint | null>(null);
  const [restoreTargetAppId, setRestoreTargetAppId] = useState<string | null>(null);
  const [restoreView, setRestoreView] = useState<RestoreView>('timeline');
  const [activeJob, setActiveJob] = useState<AutarkOsJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backupJobsQuery = useBackupJobsQuery();
  const recoveredActiveJob = useMemo(() => {
    const recovered = selectActiveBackupJob(backupJobsQuery.data ?? []) as AutarkOsJob | null;
    if (activeJob && terminalJob(activeJob) && recovered?.jobId === activeJob.jobId) {
      return null;
    }
    return recovered;
  }, [activeJob, backupJobsQuery.data]);
  const currentActiveJob = activeJob && !terminalJob(activeJob) ? activeJob : recoveredActiveJob;
  const backupReport = useBackupReportRepository({ paused: Boolean(restorePoint || running || currentActiveJob) });
  const runAppBackupMutation = useRunAppBackupMutation();
  const runFullBackupMutation = useRunFullBackupMutation();
  const runRoutineBackupMutation = useRunRoutineBackupMutation();
  const restorePlanMutation = useRestorePlanMutation();
  const restoreDetailPlanMutation = useRestorePlanMutation();
  const restoreBackupMutation = useRestoreBackupMutation();
  const verifyRestorePointMutation = useVerifyRestorePointMutation();
  const activeJobQuery = useAutarkOsJobQuery(currentActiveJob && !terminalJob(currentActiveJob) ? currentActiveJob.jobId : null);
  const report = backupReport.report;
  const pageError = error ?? (backupReport.error ? apiErrorMessage(backupReport.error, 'Backup status could not be loaded.') : null);
  const refreshBackupReport = backupReport.refresh;

  useEffect(() => {
    if (!recoveredActiveJob) {
      return;
    }
    setActiveJob((current) => current && !terminalJob(current) ? current : recoveredActiveJob);
    setRunning((current) => current ?? backupJobRunningId(recoveredActiveJob));
  }, [recoveredActiveJob]);

  useEffect(() => {
    if (activeJobQuery.data) {
      setAutarkOsJobInApplicationStateCache(queryClient, activeJobQuery.data);
      setActiveJob(activeJobQuery.data);
      if (terminalJob(activeJobQuery.data)) {
        if (activeJobQuery.data.status === 'failed') {
          setError(activeJobQuery.data.error?.message || 'Backup job failed.');
          showJobNotification(activeJobQuery.data);
        } else if (activeJobQuery.data.status === 'succeeded') {
          showJobNotification(activeJobQuery.data);
        }
        setRunning(null);
        void refreshBackupReport();
        if (activeJobQuery.data.type === 'backup_restore') {
          void invalidateApplicationState(queryClient);
        }
      }
    }
  }, [activeJobQuery.data, queryClient, refreshBackupReport]);

  useEffect(() => {
    if (activeJobQuery.error) {
      setError(apiErrorMessage(activeJobQuery.error, 'Backup job progress could not be refreshed.'));
      setRunning(null);
    }
  }, [activeJobQuery.error]);

  useEffect(() => {
    if (backupJobsQuery.error) {
      setError(apiErrorMessage(backupJobsQuery.error, 'Backup job status could not be refreshed.'));
    }
  }, [backupJobsQuery.error]);

  async function runManualAppBackup(app: AppBackupStatus) {
    await runBackup(`app-${app.appId}`, () => runAppBackupMutation.mutateAsync(app.appId));
  }

  async function runFullBackup() {
    await runBackup('full', () => runFullBackupMutation.mutateAsync());
  }

  async function runRoutineBackup() {
    await runBackup('routine', () => runRoutineBackupMutation.mutateAsync());
  }

  async function runBackup(id: string, action: () => Promise<AutarkOsJob>) {
    setRunning(id);
    setError(null);
    try {
      const result = await action();
      setActiveJob(result);
      showJobNotification(result);
      if (result.status === 'failed') {
        setError(result.error?.message || 'Backup could not be started.');
      }
      await backupReport.refresh();
    } catch (runError) {
      const notificationMessage = apiErrorMessage(runError, 'Backup could not be started.');
      setError(notificationMessage);
      showActionNotification({ severity: 'error', title: 'Backup could not start', message: notificationMessage }, 'Backup could not start');
      setRunning(null);
    }
  }

  async function openRestore(point: RestorePoint, appId?: string | null) {
    setError(null);
    setRestorePoint(point);
    setRestoreTargetAppId(appId || null);
    try {
      setRestorePlan(await restorePlanMutation.mutateAsync({ restorePointId: point.id, appId }));
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
      setDetailPlan(await restoreDetailPlanMutation.mutateAsync({ restorePointId: point.id }));
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
    try {
      const result = await restoreBackupMutation.mutateAsync({ restorePointId: restorePoint.id, appId: restoreTargetAppId });
      setActiveJob(result);
      showJobNotification(result);
      if (result.status === 'failed') {
        setError(result.error?.message || 'Restore could not be started.');
      }
      setRestorePoint(null);
      setRestorePlan(null);
      setRestoreTargetAppId(null);
      await backupReport.refresh();
    } catch (restoreError) {
      const notificationMessage = apiErrorMessage(restoreError, 'Restore could not be completed.');
      setError(notificationMessage);
      showActionNotification({ severity: 'error', title: 'Restore could not start', message: notificationMessage }, 'Restore could not start');
      setRunning(null);
    }
  }

  async function verifyRestorePoint(point: RestorePoint) {
    setRunning(`verify-${point.id}`);
    setError(null);
    try {
      const result = await verifyRestorePointMutation.mutateAsync(point.id);
      setActiveJob(result);
      showJobNotification(result);
      if (result.status === 'failed') {
        setError(result.error?.message || 'Verification could not be started.');
      }
      await backupReport.refresh();
    } catch (verifyError) {
      const notificationMessage = apiErrorMessage(verifyError, 'Backup verification could not be completed.');
      setError(notificationMessage);
      showActionNotification({ severity: 'error', title: 'Backup verification could not start', message: notificationMessage }, 'Backup verification could not start');
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

  if (backupReport.isLoading) {
    return (
      <BackupsLoadingState />
    );
  }

  return (
    <PageShell>
      <Surface as="header" className="overflow-hidden" tone="panel">
        <div className="grid gap-5 border-b border-sky-400/20 bg-slate-900 p-6 md:p-7 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-cyan-200">Backups</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-white md:text-4xl">{protectionHero.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">{protectionHero.summary}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <DisabledAction disabled={running === 'routine' || !report?.settings.automaticBackupsEnabled} reason={running === 'routine' ? 'Wait for the current routine backup to finish.' : 'Turn on routine backups in Settings first.'}>
                <ProjectPrimaryButton disabled={running === 'routine' || !report?.settings.automaticBackupsEnabled} onClick={() => void runRoutineBackup()} type="button">
                  {running === 'routine' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Run routine backup
                </ProjectPrimaryButton>
              </DisabledAction>
              {showAdvancedMetrics && (
                <DisabledAction disabled={running === 'full'} reason="Wait for the current full checkpoint to finish.">
                  <ProjectDarkControlButton disabled={running === 'full'} onClick={() => void runFullBackup()} type="button">
                    {running === 'full' ? <Loader2 className="size-4 animate-spin" /> : <Layers3 className="size-4" />}
                    Full checkpoint
                  </ProjectDarkControlButton>
                </DisabledAction>
              )}
              <RefreshStatus intervalLabel={restorePoint || running ? 'Auto-update paused' : 'Auto-updates every 30s'} onRefresh={() => void backupReport.refresh()} refreshing={backupReport.isFetching || activeJobQuery.isFetching} updatedAt={backupReport.updatedAt} />
            </div>
          </div>
          <ProtectionPanel latestRestore={latestRestore} report={report} />
        </div>

        {pageError && <BackupsErrorState message={pageError} onRetry={() => void backupReport.refresh()} />}
        {currentActiveJob && !terminalJob(currentActiveJob) && <BackupJobBanner job={currentActiveJob} />}
      </Surface>

      <CanonicalRecommendedAction />

      {report && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-5">
            <BackupPanel>
              <SectionHeader icon={DatabaseBackup} title="Create a manual backup" description="Choose the smallest backup that matches what you are about to do." />
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {showAdvancedMetrics && <ActionCard
                  busy={running === 'full'}
                  description="One restore point for every supported installed app."
                  icon={Layers3}
                  label="Full checkpoint"
                  onClick={() => void runFullBackup()}
                  title="Back up everything"
                  tone="cyan"
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
                  description={report.settings.automaticBackupsEnabled ? `${capitalizeBackupLabel(report.settings.frequency)} near ${report.settings.backupTime} (${report.settings.timeZone || 'UTC'})` : 'Turn on routine backups in Settings.'}
                  disabled={!report.settings.automaticBackupsEnabled}
                  disabledReason="Turn on routine backups in Settings first."
                  icon={CalendarClock}
                  label="Routine path"
                  onClick={() => void runRoutineBackup()}
                  title="Run routine now"
                  tone="emerald"
                />
              </div>
            </BackupPanel>

            <RoutineHealthPanel report={report} showAdvancedMetrics={showAdvancedMetrics} />

            <BackupPanel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionHeader icon={RotateCcw} title="Restore" description="Browse restore points as a visual routine timeline or a compact list." />
                <Tabs className="w-fit shrink-0" onValueChange={(value) => setRestoreView(value as RestoreView)} value={restoreView}>
                  <TabsList className="border border-sky-400/25 bg-slate-800">
                    <TabsTrigger className="px-3 text-slate-400 data-active:text-white" value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger className="px-3 text-slate-400 data-active:text-white" value="list">List</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="mt-3 min-h-[400px]">
                {restoreView === 'timeline' ? (
                  <RoutineTimeline apps={report.apps} latestRestore={latestRestore} nextRun={report.settings.nextRoutineRun} onDetails={openRestorePointDetails} onRestore={openRestore} onVerify={verifyRestorePoint} points={routineRestorePoints} running={running} timeZone={report.settings.timeZone || 'UTC'} />
                ) : (
                  <RestoreList apps={report.apps} appRestorePoints={appRestorePoints} fullRestorePoints={fullRestorePoints} onDetails={openRestorePointDetails} onRestore={openRestore} onVerify={verifyRestorePoint} running={running} />
                )}
              </div>
            </BackupPanel>

            <BackupPanel id="app-backups">
              <SectionHeader icon={Boxes} title="App backups" description="Create a focused backup for a specific app." />
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {report.apps.length ? report.apps.map((app) => (
                  <AppBackupCard app={app} key={app.appId} onRun={runManualAppBackup} running={running === `app-${app.appId}`} showAdvancedMetrics={showAdvancedMetrics} />
                )) : (
                  <EmptyState title="No apps installed" description="Install apps to begin backup protection." />
                )}
              </div>
            </BackupPanel>
          </div>

          <aside className="flex flex-col gap-5">
            <BackupPanel>
              <SectionHeader compact icon={HardDrive} title="Storage" />
              <div className="mt-4 grid gap-3">
                <FactRow label="Used" value={formatBackupBytes(report.backupStorageBytes)} />
                <FactRow label="Restore points" value={`${report.recentRestorePoints.length}`} />
                <FactRow label="Protected by restore point" value={`${report.protectedApps}/${report.totalApps}`} />
                {showAdvancedMetrics && <FactRow label="Backup folder" value={report.backupRoot} />}
                <ProjectDarkControlButton asChild className="mt-1 justify-start" size="sm">
                  <Link to="/storage">View storage</Link>
                </ProjectDarkControlButton>
              </div>
            </BackupPanel>

            <BackupPanel>
              <SectionHeader compact icon={AlertTriangle} title="Needs attention" />
              <div className="mt-4 grid gap-3">
                {needsAttention.length ? needsAttention.map((app) => <AttentionCard app={app} key={app.appId} />) : <EmptyState compact title={report.totalApps ? 'All apps have restore points' : 'No apps installed'} description={report.totalApps ? 'Installed apps are protected by completed restore points.' : 'Install an app before backup protection can begin.'} />}
              </div>
            </BackupPanel>
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

function BackupJobBanner({ job }: { job: AutarkOsJob }) {
  return (
    <div className="border-b border-cyan-300/30 bg-cyan-400/10 px-6 py-4">
      <JobProgress job={job} subjectLabel={backupSubjectLabel(job)} />
    </div>
  );
}

function BackupsLoadingState() {
  return (
    <PageShell>
      <Surface className="grid min-h-[520px] place-items-center p-8 text-center" tone="panel">
        <div className="grid justify-items-center gap-3">
          <span className="grid size-12 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-100">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <div>
            <p className="font-black text-white">Checking backups</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-sky-100/80">Loading protection status, restore points, and app backup coverage.</p>
          </div>
        </div>
      </Surface>
    </PageShell>
  );
}

function BackupsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border-b border-red-400/40 bg-red-500/10 px-6 py-4 text-red-100">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-current">Backup status could not refresh</p>
          <p className="mt-1 text-sm leading-6 text-current/80">{message}</p>
          <ProjectDarkControlButton className="mt-3 border-red-300/30 text-red-100 hover:bg-red-500/20" onClick={onRetry} size="sm" type="button">
            Try again
          </ProjectDarkControlButton>
        </div>
      </div>
    </div>
  );
}

function backupSubjectLabel(job: AutarkOsJob) {
  if (job.subjectId === '__full__') {
    return 'all apps';
  }
  if (job.subjectId === '__routine__') {
    return 'routine backup';
  }
  return job.subjectId || undefined;
}

export default BackupsPage;
