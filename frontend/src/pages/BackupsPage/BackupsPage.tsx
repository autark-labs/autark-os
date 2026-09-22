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
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
import { showActionNotification, showJobNotification } from '@/lib/actionNotifications';
import { catalogAppImageUrl, preferredAppImageUrl } from '@/lib/appImage';
import {
  useBackupReportRepository,
  useRestoreBackupMutation,
  useRestorePlanQuery,
  useRunAppBackupMutation,
  useRunFullBackupMutation,
  useRunRoutineBackupMutation,
  useVerifyRestorePointMutation,
} from '@/repositories/backupRepository';
import { terminalJob, useAutarkOsJobQuery, useAutarkOsJobsQuery } from '@/repositories/jobRepository';
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
  reportRestorePoints,
} from './BackupsPage.logic';
import { BackupColumnNavigatorWorkspace } from './BackupColumnNavigatorWorkspace';

function BackupsPage() {
  const queryClient = useQueryClient();
  const { openSettings } = useSettingsDialog();
  const applicationState = useApplicationStateRepository();
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [restoreSelection, setRestoreSelection] = useState<{ pointId: number; targetAppId: string | null; phase: 'details' | 'confirm'; error: string | null } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const restoreOriginRef = useRef<HTMLElement | null>(null);
  const backupJobsQuery = useAutarkOsJobsQuery();
  const recoveredActiveJob = selectActiveBackupJob(backupJobsQuery.data);
  const activeJobQuery = useAutarkOsJobQuery(activeJobId ?? recoveredActiveJob?.jobId ?? null, backupJobsQuery.data);
  const activeJob = activeJobQuery.data;
  const currentActiveJob = activeJob && !terminalJob(activeJob) ? activeJob : recoveredActiveJob;
  const running = pendingOperation ?? (currentActiveJob ? backupJobRunningId(currentActiveJob) : null);
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
  const backupReport = useBackupReportRepository({ paused: Boolean(running) });
  const runAppBackupMutation = useRunAppBackupMutation();
  const runFullBackupMutation = useRunFullBackupMutation();
  const runRoutineBackupMutation = useRunRoutineBackupMutation();
  const restoreBackupMutation = useRestoreBackupMutation();
  const verifyRestorePointMutation = useVerifyRestorePointMutation();
  const report = backupReport.report;
  const restorePoint = report && restoreSelection
    ? reportRestorePoints(report).find(point => point.id === restoreSelection.pointId) ?? null : null;
  const restorePlanQuery = useRestorePlanQuery(restorePoint, restoreSelection?.targetAppId ?? null);
  const restoreFlow: RestoreFlowState | null = restoreSelection ? {
    point: restorePoint,
    targetAppId: restoreSelection.targetAppId,
    phase: !restorePoint ? 'unavailable' : restoreSelection.phase === 'details' ? 'details'
      : restorePlanQuery.isFetching ? 'planning' : restorePlanQuery.error ? 'plan_error' : 'confirm',
    plan: restorePlanQuery.isFetching || restorePlanQuery.error ? null : restorePlanQuery.data ?? null,
    error: !restorePoint ? 'This restore point is no longer in the backup report. Refresh to check its availability.'
      : restorePlanQuery.error ? apiErrorMessage(restorePlanQuery.error, 'Restore plan could not be loaded.') : restoreSelection.error,
  } : null;
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
    ...(currentActiveJob && !backupJobsQuery.data?.some(job => job.jobId === currentActiveJob.jobId) ? [activeJobQuery.refetch()] : []),
  ]);

  const trackedJobId = currentActiveJob?.jobId;
  useEffect(() => {
    if (trackedJobId) setActiveJobId(trackedJobId);
  }, [trackedJobId]);

  const completedJobId = activeJob && terminalJob(activeJob) ? activeJob.jobId : null;
  useEffect(() => {
    if (!completedJobId) return;
    void refreshBackupReport();
    void invalidateApplicationState(queryClient);
  }, [completedJobId, queryClient, refreshBackupReport]);

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
    setActiveJobId(job.jobId);
    setPendingOperation(null);
    showJobNotification(job);
  }

  async function runBackup(id: string, action: () => Promise<AutarkOsJob>) {
    setPendingOperation(id);
    try {
      const result = await action();
      acceptJob(result);
    } catch (runError) {
      const notificationMessage = apiErrorMessage(runError, 'Backup could not be started.');
      showActionNotification({ severity: 'error', title: 'Backup could not start', message: notificationMessage }, 'Backup could not start');
      setPendingOperation(null);
    }
  }

  function rememberRestoreOrigin() {
    restoreOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function closeRestoreFlow() {
    setRestoreSelection(null);
    window.setTimeout(() => restoreOriginRef.current?.focus(), 0);
  }

  function openRestore(point: RestorePoint, appId?: string | null) {
    if (restoreAvailability.disabled) return;
    rememberRestoreOrigin();
    setRestoreSelection({ pointId: point.id, targetAppId: appId || null, phase: 'confirm', error: null });
  }

  function openRestorePointDetails(point: RestorePoint) {
    rememberRestoreOrigin();
    setRestoreSelection({ pointId: point.id, targetAppId: null, phase: 'details', error: null });
  }

  function changeRestoreTarget(appId: string | null) {
    if (!restoreSelection) return;
    setRestoreSelection({ ...restoreSelection, targetAppId: appId, phase: 'confirm', error: null });
    if (appId === restoreSelection.targetAppId) void restorePlanQuery.refetch();
  }

  function retryRestorePlan() {
    setRestoreSelection((current) => current ? { ...current, error: null } : current);
    if (!restorePoint) void refreshBackupReport();
    else void restorePlanQuery.refetch();
  }

  async function executeRestore() {
    if (restoreAvailability.disabled || !restoreFlow?.point || !restoreFlow?.plan || restoreFlow.phase !== 'confirm' || !restoreFlow.plan.executable) {
      return;
    }
    const { point, targetAppId } = restoreFlow;
    setPendingOperation(`restore-${point.id}`);
    setRestoreSelection((current) => current ? { ...current, error: null } : current);
    try {
      const result = await restoreBackupMutation.mutateAsync({ restorePointId: point.id, appId: targetAppId });
      acceptJob(result);
      closeRestoreFlow();
    } catch (restoreError) {
      const notificationMessage = apiErrorMessage(restoreError, 'Restore could not be completed.');
      setRestoreSelection((current) => current ? { ...current, error: notificationMessage } : current);
      showActionNotification({ severity: 'error', title: 'Restore could not start', message: notificationMessage }, 'Restore could not start');
      setPendingOperation(null);
    }
  }

  async function verifyRestorePoint(point: RestorePoint) {
    if (verifyAvailability.disabled) return;
    setPendingOperation(`verify-${point.id}`);
    try {
      const result = await verifyRestorePointMutation.mutateAsync(point.id);
      acceptJob(result);
    } catch (verifyError) {
      const notificationMessage = apiErrorMessage(verifyError, 'Backup verification could not be completed.');
      showActionNotification({ severity: 'error', title: 'Backup verification could not start', message: notificationMessage }, 'Backup verification could not start');
      setPendingOperation(null);
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
          context={<ContextChip label={pageError ? 'Backup refresh paused' : progressError ? 'Progress unavailable' : currentActiveJob?.type === 'storage_cleanup' ? 'Cleanup in progress' : currentActiveJob ? 'Backup in progress' : 'Backup status'} title="Backups / Current status" tone={pageError || progressError ? 'warning' : 'muted'}>
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
        loading={running === `restore-${restoreFlow?.point?.id}`}
        onClose={closeRestoreFlow}
        onRestore={() => void executeRestore()}
        onRetryPlan={retryRestorePlan}
        onTargetChange={changeRestoreTarget}
        onVerify={(point) => void verifyRestorePoint(point)}
        restoreAvailability={restoreAvailability}
        running={running}

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
