import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectDarkControlButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { ExtensionSlot } from '@/extensions/ExtensionSlot';
import { backupSafetyChecklist } from '@/lib/backupSafety';
import { showActionErrorNotification, showActionNotification, showJobNotification } from '@/lib/actionNotifications';
import { catalogAppImageUrl, preferredAppImageUrl } from '@/lib/appImage';
import { copyText } from '@/lib/copyText';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { activeJobs, JOB_FAMILIES, setAutarkOsJobCache, terminalJob, useAutarkOsJobQuery, useAutarkOsJobsQuery } from '@/repositories/jobRepository';
import { useCleanupOrphanMutation, useStorageReportRepository } from '@/repositories/storageRepository';
import type { AppStorageUsage, OrphanedStorage } from '@/types/system';
import type { AutarkOsJob } from '@/types/jobs';
import { StorageCapacityRibbonWorkspace } from './StorageCapacityRibbonWorkspace';
import { formatStorageBytes } from './StoragePage.presentation';

function StoragePage() {
  const queryClient = useQueryClient();
  const { showAdvancedMetrics } = useProjectSettings();
  const storage = useStorageReportRepository();
  const applicationState = useApplicationStateRepository();
  const cleanupOrphanMutation = useCleanupOrphanMutation();
  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);
  const [cleanupTarget, setCleanupTarget] = useState<OrphanedStorage | null>(null);
  const [cleanupConfirmation, setCleanupConfirmation] = useState('');
  const [cleanupJobId, setCleanupJobId] = useState<string | null>(null);
  const cleanupOpener = useRef<HTMLElement | null>(null);
  const jobs = useAutarkOsJobsQuery();
  const activeOperations = activeJobs(jobs.data, [...JOB_FAMILIES.backup, ...JOB_FAMILIES.appLifecycle, 'storage_cleanup']);
  const recoveredJob = activeOperations.find(job => job.type === 'storage_cleanup' && job.subjectId === cleanupTarget?.name);
  const cleanupJobQuery = useAutarkOsJobQuery(cleanupJobId ?? recoveredJob?.jobId ?? null, jobs.data);
  const cleanupJob = cleanupJobQuery.data && cleanupJobQuery.data.subjectId === cleanupTarget?.name ? cleanupJobQuery.data : null;
  const recoveredJobId = recoveredJob?.jobId;
  useEffect(() => {
    if (recoveredJobId) setCleanupJobId(recoveredJobId);
  }, [recoveredJobId]);
  useEffect(() => {
    // Keep the shared completion observer informed when a tracked job leaves the recent list.
    if (cleanupJob && terminalJob(cleanupJob)) setAutarkOsJobCache(queryClient, cleanupJob);
  }, [cleanupJob, queryClient]);
  const cleanupBlockedReason = jobs.isPending || jobs.error || cleanupJobQuery.error
    ? 'Cleanup status is unavailable. Retry status before starting another cleanup.'
    : activeOperations.length ? 'Wait for the current app or recovery operation to finish before starting cleanup.' : '';
  const report = storage.report;
  const appIconUrlById = useMemo(() => storageAppIconUrls(
    report?.apps ?? [],
    applicationState.applications,
  ), [applicationState.applications, report?.apps]);
  const error = storage.error ? apiErrorMessage(storage.error, 'Storage data could not be loaded.') : null;

  function refreshStorage() {
    void storage.refresh();
    void jobs.refetch();
  }

  async function copyPath(value: string, id: string) {
    const result = await copyText(value);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }
    setCopiedPathId(id);
    showActionNotification({ ok: true, severity: 'success', title: 'Path copied', message: 'Ready to paste.' }, 'Path copied');
    window.setTimeout(() => setCopiedPathId(null), 1600);
  }

  async function cleanupOrphan() {
    if (!cleanupTarget || cleanupConfirmation !== cleanupTarget.name || cleanupBlockedReason || cleanupOrphanMutation.isPending) return;

    try {
      const job = await cleanupOrphanMutation.mutateAsync(cleanupTarget.name);
      setCleanupJobId(job.jobId);
      showJobNotification(job);
      setCleanupConfirmation('');
    } catch (cleanupError) {
      showActionErrorNotification(cleanupError, 'Unused data could not be cleaned up');
    }
  }

  if (storage.isLoading) return <StorageLoadingState />;

  return (
    <>
      <PageShell
        className="xl:h-[calc(100dvh-7.25rem)] xl:min-h-0"
        contained
        contentClassName="gap-3 xl:h-full xl:min-h-0 xl:!overflow-hidden"
      >
        <ExtensionSlot
          className="shrink-0 px-3 pt-3"
          extensionId="autark-pro"
          surface="storage.insights"
        />
        <ExtensionActionTarget actionId="review-storage" className="min-h-0 flex-1" routeId="storage">
          {report ? (
          <StorageCapacityRibbonWorkspace
            refreshError={error}
            copiedPathId={copiedPathId}
            appIconUrlById={appIconUrlById}
            onCopyPath={(value, id) => void copyPath(value, id)}
            onRefresh={refreshStorage}
            onReviewOrphan={(orphan) => {
              if (!orphan.cleanupAllowed) return;
              cleanupOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              setCleanupJobId(null);
              setCleanupConfirmation('');
              setCleanupTarget(orphan);
            }}
            refreshing={storage.isFetching}
            report={report}
            showAdvancedMetrics={showAdvancedMetrics}
            updatedAt={storage.updatedAt}
          />
          ) : (
            <StorageUnavailableState message={error} onRetry={refreshStorage} />
          )}
        </ExtensionActionTarget>
      </PageShell>

      <CleanupDialog
        confirmation={cleanupConfirmation}
        blockedReason={cleanupBlockedReason}
        job={cleanupJob}
        loading={cleanupOrphanMutation.isPending}
        statusUnavailable={Boolean(jobs.error || cleanupJobQuery.error)}
        onRetryStatus={() => {
          void jobs.refetch();
          if (cleanupJobId) void cleanupJobQuery.refetch();
        }}
        onChange={setCleanupConfirmation}
        onClose={() => {
          setCleanupTarget(null);
          setCleanupConfirmation('');
        }}
        onConfirm={() => void cleanupOrphan()}
        onReviewAgain={() => setCleanupJobId(null)}
        onRestoreFocus={() => cleanupOpener.current?.focus()}
        target={cleanupTarget}
      />
    </>
  );
}

function storageAppIconUrls(
  storageApps: AppStorageUsage[],
  applications: Array<{ id: string; image: string; runtime: { image: string | null } | null }>,
) {
  const imageByAppId = new Map(applications.map((application) => [application.id, application.runtime?.image || application.image]));

  return Object.fromEntries(storageApps.map((app) => [
    app.appId,
    preferredAppImageUrl(
      imageByAppId.get(app.appId),
      catalogAppImageUrl(app.appId),
    ),
  ]));
}

function CleanupDialog({ confirmation, blockedReason, job, loading, statusUnavailable, onRetryStatus, onChange, onClose, onConfirm, onReviewAgain, onRestoreFocus, target }: {
  confirmation: string;
  blockedReason: string;
  job: AutarkOsJob | null;
  loading: boolean;
  statusUnavailable: boolean;
  onRetryStatus: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onReviewAgain: () => void;
  onRestoreFocus: () => void;
  target: OrphanedStorage | null;
}) {
  const canConfirm = Boolean(target && confirmation === target.name && !blockedReason);
  const safetyChecklist = backupSafetyChecklist('storage-cleanup');

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-sky-400/30 bg-slate-900 text-slate-100 sm:max-w-xl" onCloseAutoFocus={(event) => {
        event.preventDefault();
        onRestoreFocus();
      }}>
        <DialogHeader>
          <DialogTitle>Clean up unused app data</DialogTitle>
          <DialogDescription className="text-slate-400">{safetyChecklist[0]}</DialogDescription>
        </DialogHeader>
        {target && (
          <div className="grid gap-3">
            <CleanupFact label="Folder" value={target.name} />
            <CleanupFact label="Path" value={target.path} />
            <CleanupFact label="Space to recover" value={formatStorageBytes(target.usedBytes)} />
            <div className="rounded-lg border border-orange-400/45 bg-orange-500/10 p-3 text-sm text-orange-200">{safetyChecklist[1]}</div>
            {job ? <JobProgress job={job} subjectLabel={target.name} /> : <>
              <label className="text-sm font-semibold text-slate-300" htmlFor="cleanup-confirmation">Type `{target.name}` to confirm</label>
              <Input disabled={loading} className="border-slate-700 bg-slate-950 text-slate-100 focus:border-emerald-300/50" id="cleanup-confirmation" onChange={(event) => onChange(event.target.value)} value={confirmation} />
            </>}
            {(loading || job && !terminalJob(job)) && <p className="text-sm text-muted-foreground">Closing does not cancel cleanup. Follow progress in Activity, even after leaving this page.</p>}
            {statusUnavailable && <div className="text-sm text-muted-foreground" role="status">
              <p>Cleanup status could not be refreshed. Any progress shown is the last known status.</p>
              <ProjectDarkControlButton onClick={onRetryStatus} type="button">Retry status</ProjectDarkControlButton>
            </div>}
          </div>
        )}
        <DialogFooter>
          <ProjectDarkControlButton onClick={onClose} type="button">{loading || job ? 'Close' : 'Cancel'}</ProjectDarkControlButton>
          {job?.status === 'failed' && <ProjectDarkControlButton onClick={onReviewAgain} type="button">Review cleanup again</ProjectDarkControlButton>}
          {!job && <DisabledAction disabled={!canConfirm || loading} reason={loading ? 'Autark-OS is already preparing this cleanup.' : blockedReason || 'Type the folder name exactly before cleanup can continue.'}>
            <ProjectWarningButton disabled={!canConfirm || loading} onClick={onConfirm} type="button">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Archive and remove folder
            </ProjectWarningButton>
          </DisabledAction>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CleanupFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-sky-400/25 bg-slate-800 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 select-text break-words text-sm text-slate-100">{value}</p></div>;
}

function StorageLoadingState() {
  return (
    <PageShell>
      <PageLoadingState className="min-h-[520px]" model={{ description: 'Reading disk space, app data, backups, and cleanup candidates.', title: 'Checking storage' }} />
    </PageShell>
  );
}

function StorageUnavailableState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return <PageLoadError className="m-auto w-full max-w-2xl" model={{ message: message || 'Autark-OS could not read storage data yet.', title: 'Storage status is unavailable' }} onRetry={onRetry} />;
}


export default StoragePage;
