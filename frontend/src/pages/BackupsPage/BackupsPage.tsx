import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, AppWindow, Boxes, CalendarClock, DatabaseBackup, HardDrive, Layers3, Loader2, Play, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@/api/httpClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectInlineEmptyState as EmptyState } from '@/components/primitives/EmptyState';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { Surface } from '@/components/primitives/Surface';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
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
import type { AppBackupStatus, RestorePoint } from '@/types/backup';
import type { AutarkOsJob } from '@/types/jobs';
import {
  ActionCard,
  AppBackupCard,
  BackupPanel,
  AttentionCard,
  FactRow,
  ProtectionPanel,
  RestoreFlowDialog,
  RestoreList,
  RoutineHealthPanel,
  RoutineTimeline,
  SectionHeader,
} from './BackupsPage.components';
import type { RestoreFlowState } from './BackupsPage.components';
import { activeBackupJobs, backupJobRunningId, backupOperationAvailability, backupOperationForJob, backupOperationForRunningId, backupPageViewModel, capitalizeBackupLabel, formatBackupBytes, selectActiveBackupJob } from './BackupsPage.logic';

type RestoreView = 'timeline' | 'list';

function BackupsPage() {
  const queryClient = useQueryClient();
  const { showAdvancedMetrics } = useProjectSettings();
  const { openSettings } = useSettingsDialog();
  const [running, setRunning] = useState<string | null>(null);
  const [restoreFlow, setRestoreFlow] = useState<RestoreFlowState | null>(null);
  const [restoreView, setRestoreView] = useState<RestoreView>('timeline');
  const [activeJob, setActiveJob] = useState<AutarkOsJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const restoreOriginRef = useRef<HTMLElement | null>(null);
  const restorePlanTokenRef = useRef(0);
  const backupJobsQuery = useBackupJobsQuery();
  const recoveredActiveJob = useMemo(() => {
    const recovered = selectActiveBackupJob(backupJobsQuery.data ?? []) as AutarkOsJob | null;
    if (activeJob && terminalJob(activeJob) && recovered?.jobId === activeJob.jobId) {
      return null;
    }
    return recovered;
  }, [activeJob, backupJobsQuery.data]);
  const currentActiveJob = activeJob && !terminalJob(activeJob) ? activeJob : recoveredActiveJob;
  const activeBackupOperations = useMemo(() => {
    const durableOperations = activeBackupJobs(backupJobsQuery.data ?? [])
      .map((job) => backupOperationForJob(job))
      .filter((operation): operation is NonNullable<typeof operation> => Boolean(operation));
    const localOperation = backupOperationForRunningId(running);
    return [...new Set(localOperation ? [...durableOperations, localOperation] : durableOperations)];
  }, [backupJobsQuery.data, running]);
  const appBackupAvailability = backupOperationAvailability('app_backup', activeBackupOperations);
  const fullBackupOperationAvailability = backupOperationAvailability('full_backup', activeBackupOperations);
  const restoreAvailability = backupOperationAvailability('restore', activeBackupOperations);
  const routineBackupOperationAvailability = backupOperationAvailability('routine_backup', activeBackupOperations);
  const verifyAvailability = backupOperationAvailability('verify', activeBackupOperations);
  const backupReport = useBackupReportRepository({ paused: Boolean(restoreFlow || running || currentActiveJob) });
  const runAppBackupMutation = useRunAppBackupMutation();
  const runFullBackupMutation = useRunFullBackupMutation();
  const runRoutineBackupMutation = useRunRoutineBackupMutation();
  const restorePlanMutation = useRestorePlanMutation();
  const restoreBackupMutation = useRestoreBackupMutation();
  const verifyRestorePointMutation = useVerifyRestorePointMutation();
  const activeJobQuery = useAutarkOsJobQuery(currentActiveJob && !terminalJob(currentActiveJob) ? currentActiveJob.jobId : null);
  const report = backupReport.report;
  const destinationUnavailableReason = report && report.destination.status !== 'ready'
    ? `${report.destination.message} Update the backup destination in Settings before creating a new backup.`
    : '';
  const recoveryLimitedApps = report?.apps.filter((app) => !app.backupAvailable) ?? [];
  const batchBackupUnavailableReason = recoveryLimitedApps.length
    ? `Review ${recoveryLimitedApps.map((app) => app.appName).join(', ')} in My Apps before running a full or routine backup because the original Compose configuration is missing.`
    : '';
  const fullBackupAvailability = destinationUnavailableReason
    ? { disabled: true, reason: destinationUnavailableReason }
    : batchBackupUnavailableReason
    ? { disabled: true, reason: batchBackupUnavailableReason }
    : fullBackupOperationAvailability;
  const routineBackupAvailability = destinationUnavailableReason
    ? { disabled: true, reason: destinationUnavailableReason }
    : batchBackupUnavailableReason
    ? { disabled: true, reason: batchBackupUnavailableReason }
    : routineBackupOperationAvailability;
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

  const appBackupOperationAvailability = destinationUnavailableReason
    ? { disabled: true, reason: destinationUnavailableReason }
    : appBackupAvailability;

  async function runManualAppBackup(app: AppBackupStatus) {
    if (appBackupOperationAvailability.disabled) return;
    await runBackup(`app-${app.appId}`, () => runAppBackupMutation.mutateAsync(app.appId));
  }

  async function runFullBackup() {
    if (fullBackupAvailability.disabled) return;
    await runBackup('full', () => runFullBackupMutation.mutateAsync());
  }

  async function runRoutineBackup() {
    if (routineBackupAvailability.disabled) return;
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

  function rememberRestoreOrigin() {
    restoreOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function closeRestoreFlow() {
    setRestoreFlow(null);
    window.setTimeout(() => restoreOriginRef.current?.focus(), 0);
  }

  async function loadRestorePlan(point: RestorePoint, appId: string | null, phase: 'details' | 'planning' = 'planning') {
    const token = restorePlanTokenRef.current + 1;
    restorePlanTokenRef.current = token;
    setRestoreFlow((current) => current && current.point.id === point.id
      ? { ...current, error: null, phase, plan: phase === 'planning' ? null : current.plan, targetAppId: appId }
      : { error: null, phase, plan: null, point, targetAppId: appId });
    try {
      const plan = await restorePlanMutation.mutateAsync({ restorePointId: point.id, appId });
      setRestoreFlow((current) => token === restorePlanTokenRef.current && current && current.point.id === point.id
        ? { ...current, error: null, phase: phase === 'details' ? 'details' : 'confirm', plan, targetAppId: appId }
        : current);
    } catch (planError) {
      const message = apiErrorMessage(planError, 'Restore plan could not be loaded.');
      setRestoreFlow((current) => token === restorePlanTokenRef.current && current && current.point.id === point.id
        ? { ...current, error: message, phase: phase === 'details' ? 'details' : 'plan_error', plan: null, targetAppId: appId }
        : current);
    }
  }

  async function openRestore(point: RestorePoint, appId?: string | null) {
    if (restoreAvailability.disabled) return;
    rememberRestoreOrigin();
    setError(null);
    await loadRestorePlan(point, appId || null);
  }

  async function openRestorePointDetails(point: RestorePoint) {
    rememberRestoreOrigin();
    setError(null);
    setRestoreFlow({ error: null, phase: 'details', plan: null, point, targetAppId: null });
    await loadRestorePlan(point, null, 'details');
  }

  function prepareRestoreFromDetails() {
    if (!restoreFlow) {
      return;
    }
    if (restoreFlow.plan && restoreFlow.plan.targetAppId === restoreFlow.targetAppId) {
      setRestoreFlow((current) => current ? { ...current, error: null, phase: 'confirm' } : current);
      return;
    }
    void loadRestorePlan(restoreFlow.point, restoreFlow.targetAppId);
  }

  function changeRestoreTarget(appId: string | null) {
    if (!restoreFlow) {
      return;
    }
    if (restoreFlow.phase === 'details') {
      prepareRestoreFromDetails();
      return;
    }
    void loadRestorePlan(restoreFlow.point, appId);
  }

  function retryRestorePlan() {
    if (!restoreFlow) {
      return;
    }
    void loadRestorePlan(restoreFlow.point, restoreFlow.targetAppId, restoreFlow.phase === 'details' ? 'details' : 'planning');
  }

  async function executeRestore() {
    if (restoreAvailability.disabled || !restoreFlow?.plan || restoreFlow.phase !== 'confirm' || !restoreFlow.plan.executable) {
      return;
    }
    const { point, targetAppId } = restoreFlow;
    setRunning(`restore-${point.id}`);
    setError(null);
    setRestoreFlow((current) => current ? { ...current, error: null } : current);
    try {
      const result = await restoreBackupMutation.mutateAsync({ restorePointId: point.id, appId: targetAppId });
      setActiveJob(result);
      showJobNotification(result);
      if (result.status === 'failed') {
        setError(result.error?.message || 'Restore could not be started.');
      }
      closeRestoreFlow();
      await backupReport.refresh();
    } catch (restoreError) {
      const notificationMessage = apiErrorMessage(restoreError, 'Restore could not be completed.');
      setError(notificationMessage);
      setRestoreFlow((current) => current ? { ...current, error: notificationMessage } : current);
      showActionNotification({ severity: 'error', title: 'Restore could not start', message: notificationMessage }, 'Restore could not start');
      setRunning(null);
    }
  }

  async function verifyRestorePoint(point: RestorePoint) {
    if (verifyAvailability.disabled) return;
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
              <DisabledAction disabled={routineBackupAvailability.disabled || !report?.settings.automaticBackupsEnabled} reason={routineBackupAvailability.disabled ? routineBackupAvailability.reason : 'Turn on routine backups in Settings first.'}>
                <ProjectPrimaryButton disabled={routineBackupAvailability.disabled || !report?.settings.automaticBackupsEnabled} onClick={() => void runRoutineBackup()} type="button">
                  {running === 'routine' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Run routine backup
                </ProjectPrimaryButton>
              </DisabledAction>
              {showAdvancedMetrics && (
                <DisabledAction disabled={fullBackupAvailability.disabled} reason={fullBackupAvailability.reason}>
                  <ProjectDarkControlButton disabled={fullBackupAvailability.disabled} onClick={() => void runFullBackup()} type="button">
                    {running === 'full' ? <Loader2 className="size-4 animate-spin" /> : <Layers3 className="size-4" />}
                    Full checkpoint
                  </ProjectDarkControlButton>
                </DisabledAction>
              )}
              <RefreshStatus intervalLabel={restoreFlow || running ? 'Auto-update paused' : 'Auto-updates every 30s'} onRefresh={() => void backupReport.refresh()} refreshing={backupReport.isFetching || activeJobQuery.isFetching} updatedAt={backupReport.updatedAt} />
            </div>
          </div>
          <ProtectionPanel latestRestore={latestRestore} report={report} />
        </div>

        {pageError && <BackupsErrorState message={pageError} onRetry={() => void backupReport.refresh()} />}
        {currentActiveJob && !terminalJob(currentActiveJob) && <BackupJobBanner job={currentActiveJob} />}
      </Surface>

      {report && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-5">
            <BackupPanel>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <p className="text-sm font-bold text-white">{report.destination.kind === 'external' ? 'External backup drive' : 'Backup location on this device'}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{report.destination.message}</p>
                </div>
                <ProjectDarkControlButton onClick={() => openSettings('backups')} size="sm" type="button">
                  {report.destination.status === 'ready' ? 'Review destination' : 'Fix destination'}
                </ProjectDarkControlButton>
              </div>
              <SectionHeader icon={DatabaseBackup} title="Create a manual backup" description="Choose the smallest backup that matches what you are about to do." />
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {showAdvancedMetrics && <ActionCard
                  busy={running === 'full'}
                  description="One restore point for every supported installed app."
                  icon={Layers3}
                  disabled={fullBackupAvailability.disabled}
                  disabledReason={fullBackupAvailability.reason}
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
                  disabled={routineBackupAvailability.disabled || !report.settings.automaticBackupsEnabled}
                  disabledReason={routineBackupAvailability.disabled ? routineBackupAvailability.reason : 'Turn on routine backups in Settings first.'}
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
                  <RoutineTimeline apps={report.apps} latestRestore={latestRestore} nextRun={report.settings.nextRoutineRun} onDetails={openRestorePointDetails} onRestore={openRestore} onVerify={verifyRestorePoint} points={routineRestorePoints} restoreAvailability={restoreAvailability} running={running} timeZone={report.settings.timeZone || 'UTC'} verifyAvailability={verifyAvailability} />
                ) : (
                  <RestoreList apps={report.apps} appRestorePoints={appRestorePoints} fullRestorePoints={fullRestorePoints} onDetails={openRestorePointDetails} onRestore={openRestore} onVerify={verifyRestorePoint} restoreAvailability={restoreAvailability} running={running} timeZone={report.settings.timeZone || 'UTC'} verifyAvailability={verifyAvailability} />
                )}
              </div>
            </BackupPanel>

            <BackupPanel id="app-backups">
              <SectionHeader icon={Boxes} title="App backups" description="Create a focused backup for a specific app." />
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {report.apps.length ? report.apps.map((app) => (
                  <AppBackupCard app={app} key={app.appId} onRun={runManualAppBackup} operationAvailability={appBackupOperationAvailability} running={running === `app-${app.appId}`} showAdvancedMetrics={showAdvancedMetrics} timeZone={report.settings.timeZone || 'UTC'} />
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
                <FactRow label="Destination" value={report.destination.kind === 'external' ? 'External drive' : 'This device'} />
                <FactRow label="Destination status" value={report.destination.status === 'ready' ? 'Ready' : report.destination.message} />
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

      <RestoreFlowDialog
        appOptions={report?.apps ?? []}
        flow={restoreFlow}
        loading={running === `restore-${restoreFlow?.point.id}`}
        onClose={closeRestoreFlow}
        onRestore={() => void executeRestore()}
        onRetryPlan={retryRestorePlan}
        onTargetChange={changeRestoreTarget}
        onVerify={(point) => void verifyRestorePoint(point)}
        restoreAvailability={restoreAvailability}
        running={running}
        showAdvancedMetrics={showAdvancedMetrics}
        timeZone={report?.settings.timeZone || 'UTC'}
        verifyAvailability={verifyAvailability}
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
      <PageLoadingState className="min-h-[520px]" model={{ description: 'Loading protection status, restore points, and app backup coverage.', title: 'Checking backups' }} />
    </PageShell>
  );
}

function BackupsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <PageLoadError className="rounded-none border-x-0 border-t-0 px-6 py-4" model={{ message, title: 'Backup status could not refresh' }} onRetry={onRetry} />;
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
