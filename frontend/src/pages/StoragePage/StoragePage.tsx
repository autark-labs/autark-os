import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectDarkControlButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { backupSafetyChecklist } from '@/lib/backupSafety';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { invalidateApplicationState } from '@/repositories/applicationStateRepository';
import { homeQueryKeys } from '@/repositories/homeRepository';
import { useCleanupOrphanMutation, useStorageReportRepository } from '@/repositories/storageRepository';
import type { OrphanedStorage } from '@/types/system';
import { StorageCapacityRibbonWorkspace } from './StorageCapacityRibbonWorkspace';
import { formatStorageBytes } from './StoragePage.presentation';

function StoragePage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const queryClient = useQueryClient();
  const storage = useStorageReportRepository();
  const cleanupOrphanMutation = useCleanupOrphanMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);
  const [cleanupTarget, setCleanupTarget] = useState<OrphanedStorage | null>(null);
  const [cleanupConfirmation, setCleanupConfirmation] = useState('');
  const report = storage.report;
  const error = actionError ?? (storage.error ? apiErrorMessage(storage.error, 'Storage data could not be loaded.') : null);

  async function copyPath(value: string, id: string) {
    const result = await copyText(value);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }
    setCopiedPathId(id);
    showActionNotification({ ok: true, severity: 'success', title: 'Path copied', message: value }, 'Path copied');
    window.setTimeout(() => setCopiedPathId(null), 1600);
  }

  async function cleanupOrphan() {
    if (!cleanupTarget || cleanupConfirmation !== cleanupTarget.name) return;

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
      await Promise.all([
        storage.refresh(),
        invalidateApplicationState(queryClient),
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['monitoring'] }),
      ]);
    } catch (cleanupError) {
      const message = apiErrorMessage(cleanupError, 'Unused data could not be cleaned up.');
      setActionError(message);
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
        {error && <StorageErrorState message={error} onRetry={() => void storage.refresh()} />}
        {report ? (
          <StorageCapacityRibbonWorkspace
            copiedPathId={copiedPathId}
            onCopyPath={(value, id) => void copyPath(value, id)}
            onRefresh={() => void storage.refresh()}
            onReviewOrphan={setCleanupTarget}
            refreshing={storage.isFetching}
            report={report}
            showAdvancedMetrics={showAdvancedMetrics}
            updatedAt={storage.updatedAt}
          />
        ) : (
          <StorageUnavailableState message={error} onRetry={() => void storage.refresh()} />
        )}
      </PageShell>

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
    </>
  );
}

function CleanupDialog({ confirmation, loading, onChange, onClose, onConfirm, target }: {
  confirmation: string;
  loading: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  target: OrphanedStorage | null;
}) {
  const canConfirm = Boolean(target && confirmation === target.name);
  const safetyChecklist = backupSafetyChecklist('storage-cleanup');

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl border-sky-400/30 bg-slate-900 text-slate-100">
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
            <label className="text-sm font-semibold text-slate-300" htmlFor="cleanup-confirmation">Type `{target.name}` to confirm</label>
            <Input className="border-slate-700 bg-slate-950 text-slate-100 focus:border-emerald-300/50" id="cleanup-confirmation" onChange={(event) => onChange(event.target.value)} value={confirmation} />
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

function StorageErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <PageLoadError className="shrink-0 px-4 py-3" model={{ message, title: 'Storage data could not refresh' }} onRetry={onRetry} />;
}

export default StoragePage;
