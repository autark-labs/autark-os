import axios from 'axios';
import { JobsAPIClient } from '@/api/JobsAPIClient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '@/api/httpClient';
import { BackupReviewDialog } from '@/components/autark-os/BackupReviewDialog';
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
  useRestorePointQuery,
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
import type { AppBackupStatus, RestorePoint, BackupReviewRequest } from '@/types/backup';
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
  const { openSettings } = useSettingsDialog();
  const applicationState = useApplicationStateRepository();
  const [backupReview, setBackupReview] = useState<BackupReviewRequest | null>(null);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [restoreSelection, setRestoreSelection] = useState<{ pointId: number; targetAppId: string | null; phase: 'details' | 'confirm' | 'submitting' | 'unknown' | 'submitted'; error: string | null; jobId?: string } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const restoreRequestRef = useRef(0);
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
  const restorePointQuery = useRestorePointQuery(restoreSelection?.pointId ?? null);
  const restorePoint = restorePointQuery.data ?? null;
  const restorePlanQuery = useRestorePlanQuery(restorePoint, restoreSelection?.targetAppId ?? null, restoreSelection?.phase === 'confirm');
  const submittedJob = backupJobsQuery.data?.find(job => job.jobId === restoreSelection?.jobId)
    ?? (activeJob?.jobId === restoreSelection?.jobId ? activeJob : null);
  const restoreFlow: RestoreFlowState | null = restoreSelection ? {
    point: restorePoint,
    targetAppId: restoreSelection.targetAppId,
    phase: (restoreSelection.phase === 'submitting' || restoreSelection.phase === 'unknown' || restoreSelection.phase === 'submitted') ? restoreSelection.phase
      : restorePointQuery.isLoading ? 'loading' : !restorePoint ? 'unavailable' : restoreSelection.phase === 'details' ? 'details'
      : restorePlanQuery.isFetching ? 'planning' : restorePlanQuery.error ? 'plan_error' : 'confirm',
    plan: restorePlanQuery.isFetching || restorePlanQuery.error ? null : restorePlanQuery.data ?? null,
    job: submittedJob,
    error: restoreSelection.error ?? (!restorePoint && !restorePointQuery.isLoading
      ? apiErrorMessage(restorePointQuery.error, 'This restore point is no longer available.')
      : restoreSelection.phase === 'confirm' && restorePlanQuery.error ? apiErrorMessage(restorePlanQuery.error, 'Restore plan could not be loaded.') : null),
  } : null;
  const appIconUrlById = useMemo(() => backupAppIconUrls(
    report?.apps ?? [],
    applicationState.applications,
  ), [applicationState.applications, report?.apps]);
  const destinationUnavailableReason = report && report.destination.status !== 'ready'
    ? `${report.destination.message} Update the backup destination in Settings before creating a new backup.`
    : '';
  const fullBackupAvailability = destinationUnavailableReason
    ? { disabled: true, reason: destinationUnavailableReason }
    : fullBackupOperationAvailability;
  const routineBackupAvailability = destinationUnavailableReason
    ? { disabled: true, reason: destinationUnavailableReason }
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
    setBackupReview({ scope: 'app', appId: app.appId });
  }

  async function runFullBackup() {
    if (fullBackupAvailability.disabled) return;
    setBackupReview({ scope: 'full' });
  }

  async function runRoutineBackup() {
    if (routineBackupAvailability.disabled) return;
    setBackupReview({ scope: 'routine' });
  }

  async function confirmBackup(planId: string) {
    if (!backupReview) return;
    if (backupReview.scope === 'app' && backupReview.appId) {
      const appId = backupReview.appId;
      await runBackup(`app-${appId}`, () => runAppBackupMutation.mutateAsync({ appId, planId }));
    } else if (backupReview.scope === 'full') {
      await runBackup('full', () => runFullBackupMutation.mutateAsync(planId));
    } else {
      await runBackup('routine', () => runRoutineBackupMutation.mutateAsync(planId));
    }
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
      throw runError;
    }
  }

  function rememberRestoreOrigin() {
    restoreOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function closeRestoreFlow() {
    restoreRequestRef.current++;
    setRestoreSelection(null);
    window.setTimeout(() => restoreOriginRef.current?.focus(), 0);
  }

  function openRestore(point: RestorePoint, appId?: string | null) {
    if (restoreAvailability.disabled) return;
    rememberRestoreOrigin();
    restoreRequestRef.current++;
    setRestoreSelection({ pointId: point.id, targetAppId: appId || null, phase: 'confirm', error: null });
  }

  function openRestorePointDetails(point: RestorePoint) {
    rememberRestoreOrigin();
    restoreRequestRef.current++;
    setRestoreSelection({ pointId: point.id, targetAppId: null, phase: 'details', error: null });
  }

  function changeRestoreTarget(appId: string | null) {
    if (!restoreSelection) return;
    restoreRequestRef.current++;
    setRestoreSelection({ ...restoreSelection, targetAppId: appId, phase: 'confirm', error: null });
    if (restoreSelection.phase === 'confirm' && appId === restoreSelection.targetAppId) void restorePlanQuery.refetch();
  }

  function retryRestorePlan() {
    if (restoreSelection?.phase === 'unknown') {
      void reconcileRestore(restoreSelection.jobId!, restoreRequestRef.current);
      return;
    }
    setRestoreSelection((current) => current ? { ...current, error: null } : current);
    if (!restorePoint) void restorePointQuery.refetch();
    else void restorePlanQuery.refetch();
  }

  async function reconcileRestore(jobId: string, requestId: number) {
    try {
      const job = await JobsAPIClient.get(jobId);
      if (job.jobId !== jobId || job.type !== 'backup_restore') return;
      acceptJob(job);
      await backupJobsQuery.refetch();
      if (restoreRequestRef.current === requestId) setRestoreSelection(current => current ? { ...current, phase: 'submitted', jobId: job.jobId, error: null } : current);
    } catch {
      // An unavailable Activity response cannot establish that submission failed.
    }
  }

  async function executeRestore() {
    if (restoreAvailability.disabled || !restoreFlow?.point || !restoreFlow?.plan || restoreFlow.phase !== 'confirm' || restoreFlow.error || !restoreFlow.plan.executable) return;
    const { point, targetAppId, plan } = restoreFlow;
    const requestId = restoreRequestRef.current;
    setPendingOperation(`restore-${point.id}`);
    setRestoreSelection(current => current ? { ...current, phase: 'submitting', error: null, jobId: plan.jobId } : current);
    try {
      const result = await restoreBackupMutation.mutateAsync({ restorePointId: point.id, appId: targetAppId, planId: plan.planId });
      acceptJob(result);
      if (restoreRequestRef.current === requestId) setRestoreSelection(current => current ? { ...current, phase: 'submitted', jobId: result.jobId } : current);
    } catch (restoreError) {
      setPendingOperation(null);
      const unknownAcceptance = axios.isAxiosError(restoreError) && (!restoreError.response || restoreError.response.status >= 500);
      if (unknownAcceptance) {
        if (restoreRequestRef.current === requestId) setRestoreSelection(current => current ? { ...current, phase: 'unknown', error: null } : current);
        showActionNotification({ severity: 'warning', title: 'Checking restore status', message: 'The submission response was lost. Check Activity before starting another restore.' }, 'Checking restore status');
        await reconcileRestore(plan.jobId, requestId);
      } else {
        const notificationMessage = apiErrorMessage(restoreError, 'Restore could not be started.');
        if (restoreRequestRef.current === requestId) setRestoreSelection(current => current ? { ...current, phase: 'confirm', error: notificationMessage } : current);
        showActionNotification({ severity: 'error', title: 'Restore could not start', message: notificationMessage }, 'Restore could not start');
      }
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

      {backupReview && <BackupReviewDialog request={backupReview} onClose={() => setBackupReview(null)} onConfirm={confirmBackup} />}
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
