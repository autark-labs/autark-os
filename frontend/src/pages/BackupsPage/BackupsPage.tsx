import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '@/api/httpClient';
import { ContextChip } from '@/components/autark-os/ContextChip';
import { Button } from '@/components/ui/button';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { PageShell } from '@/components/layout/PageShell';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
import { showActionNotification, showJobNotification } from '@/lib/actionNotifications';
import { catalogAppImageUrl, preferredAppImageUrl } from '@/lib/appImage';
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
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import type { AppBackupStatus, RestorePoint } from '@/types/backup';
import type { AutarkOsJob } from '@/types/jobs';
import { RestoreFlowDialog } from './BackupsPage.components';
import type { RestoreFlowState } from './BackupsPage.components';
import {
  activeBackupJobs,
  backupJobRunningId,
  backupOperationAvailability,
  backupOperationForJob,
  backupOperationForRunningId,
  selectActiveBackupJob,
} from './BackupsPage.logic';
import { BackupColumnNavigatorWorkspace } from './BackupColumnNavigatorWorkspace';

function BackupsPage() {
  const queryClient = useQueryClient();
  const { showAdvancedMetrics } = useProjectSettings();
  const { openSettings } = useSettingsDialog();
  const applicationState = useApplicationStateRepository();
  const [running, setRunning] = useState<string | null>(null);
  const [restoreFlow, setRestoreFlow] = useState<RestoreFlowState | null>(null);
  const [activeJob, setActiveJob] = useState<AutarkOsJob | null>(null);
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
  const appIconUrlById = useMemo(() => backupAppIconUrls(
    report?.apps ?? [],
    applicationState.applications,
  ), [applicationState.applications, report?.apps]);
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
  const pageError = backupReport.error ? apiErrorMessage(backupReport.error, 'Backup status could not be loaded.') : null;
  const refreshBackupReport = backupReport.refresh;
  const progressError = activeJobQuery.error || backupJobsQuery.error;
  const refreshStatus = () => Promise.all([
    backupReport.refresh(), backupJobsQuery.refetch(),
    ...(currentActiveJob ? [activeJobQuery.refetch()] : []),
  ]);

  useEffect(() => {
    if (!recoveredActiveJob) {
      return;
    }
    setActiveJob((current) => current && !terminalJob(current) ? current : recoveredActiveJob);
    setRunning((current) => current ?? backupJobRunningId(recoveredActiveJob));
  }, [recoveredActiveJob]);

  useEffect(() => {
    if (activeJobQuery.data) {
      void invalidateApplicationState(queryClient);
      setActiveJob(activeJobQuery.data);
      if (terminalJob(activeJobQuery.data)) {
        setRunning(null);
        void refreshBackupReport();
        if (activeJobQuery.data.type === 'backup_restore') {
          void invalidateApplicationState(queryClient);
        }
      }
    }
  }, [activeJobQuery.data, queryClient, refreshBackupReport]);

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

  function acceptJob(job: AutarkOsJob) {
    setActiveJob(job);
    if (terminalJob(job)) setRunning(null);
    showJobNotification(job);
  }

  async function runBackup(id: string, action: () => Promise<AutarkOsJob>) {
    setRunning(id);
    try {
      const result = await action();
      acceptJob(result);
      await backupReport.refresh();
    } catch (runError) {
      const notificationMessage = apiErrorMessage(runError, 'Backup could not be started.');
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
    await loadRestorePlan(point, appId || null);
  }

  async function openRestorePointDetails(point: RestorePoint) {
    rememberRestoreOrigin();
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
    setRestoreFlow((current) => current ? { ...current, error: null } : current);
    try {
      const result = await restoreBackupMutation.mutateAsync({ restorePointId: point.id, appId: targetAppId });
      acceptJob(result);
      closeRestoreFlow();
      await backupReport.refresh();
    } catch (restoreError) {
      const notificationMessage = apiErrorMessage(restoreError, 'Restore could not be completed.');
      setRestoreFlow((current) => current ? { ...current, error: notificationMessage } : current);
      showActionNotification({ severity: 'error', title: 'Restore could not start', message: notificationMessage }, 'Restore could not start');
      setRunning(null);
    }
  }

  async function verifyRestorePoint(point: RestorePoint) {
    if (verifyAvailability.disabled) return;
    setRunning(`verify-${point.id}`);
    try {
      const result = await verifyRestorePointMutation.mutateAsync(point.id);
      acceptJob(result);
      await backupReport.refresh();
    } catch (verifyError) {
      const notificationMessage = apiErrorMessage(verifyError, 'Backup verification could not be completed.');
      showActionNotification({ severity: 'error', title: 'Backup verification could not start', message: notificationMessage }, 'Backup verification could not start');
      setRunning(null);
    }
  }

  if (backupReport.isLoading) {
    return (
      <BackupsLoadingState />
    );
  }

  return (
    <PageShell
      className="xl:h-[calc(100dvh-7.25rem)] xl:min-h-0"
      contained
      contentClassName="gap-3 xl:h-full xl:min-h-0 xl:!overflow-hidden"
    >
      {!report && <BackupsErrorState message={pageError || 'Backup status is unavailable.'} onRetry={() => void refreshStatus()} />}
      {report && (
        <ExtensionActionTarget actionId="review-backups" className="min-h-0 flex-1" routeId="backups">
          <BackupColumnNavigatorWorkspace
          context={<ContextChip label={pageError ? 'Backup refresh paused' : progressError ? 'Progress unavailable' : currentActiveJob ? 'Backup in progress' : 'Backup status'} title="Backups / Current status" tone={pageError || progressError ? 'warning' : 'muted'}>
            {pageError && <p>{pageError} Previous information remains visible.</p>}
            {Boolean(progressError) && <p>Job progress could not refresh. This does not mean the operation failed.</p>}
            {currentActiveJob && <JobProgress compact job={currentActiveJob} subjectLabel={backupSubjectLabel(currentActiveJob)} />}
            {!currentActiveJob && !progressError && !pageError && <p>Backup information is up to date.</p>}
            <Button disabled={backupReport.isFetching || activeJobQuery.isFetching || backupJobsQuery.isFetching} onClick={() => void refreshStatus()} size="sm" type="button">Check backup status</Button>
          </ContextChip>}
          appIconUrlById={appIconUrlById}
          appBackupAvailability={appBackupOperationAvailability}
          fullBackupAvailability={fullBackupAvailability}
          onCreateAppBackup={runManualAppBackup}
          onCreateFullBackup={() => void runFullBackup()}
          onOpenRestoreDetails={openRestorePointDetails}
          onOpenRestorePlan={openRestore}
          onOpenSettings={() => openSettings('backups')}
          onRefresh={() => void refreshStatus()}
          onRunRoutineBackup={() => void runRoutineBackup()}
          onVerifyRestorePoint={verifyRestorePoint}
          refreshing={backupReport.isFetching || activeJobQuery.isFetching}
          report={report}
          restoreAvailability={restoreAvailability}
          routineBackupAvailability={routineBackupAvailability}
          running={running}
          verifyAvailability={verifyAvailability}
          />
        </ExtensionActionTarget>
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

function backupAppIconUrls(
  backupApps: AppBackupStatus[],
  applications: Array<{ id: string; image: string; runtime: { image: string | null } | null }>,
) {
  const imageByAppId = new Map(applications.map((application) => [application.id, application.runtime?.image || application.image]));

  return Object.fromEntries(backupApps.map((app) => [
    app.appId,
    preferredAppImageUrl(
      imageByAppId.get(app.appId),
      catalogAppImageUrl(app.appId),
    ),
  ]));
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
