import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { BackupReviewRequest } from '@/types/backup';

export function BackupReviewDialog({ request, onClose, onConfirm }: {
  request: BackupReviewRequest;
  onClose: () => void;
  onConfirm: (planId: string) => Promise<void>;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [origin] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const plan = useQuery({
    queryKey: ['backups', 'run-plan', request.scope, request.appId],
    queryFn: () => BackupAPIClient.plan(request),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  async function confirm() {
    if (!plan.data?.executable || plan.isFetching || needsReview || running) return;
    setRunning(true);
    setError(null);
    try {
      await onConfirm(plan.data.planId);
      onClose();
    } catch (failure) {
      setError(apiErrorMessage(failure, 'Backup could not start. Review the current plan before trying again.'));
      setNeedsReview(true);
    } finally { setRunning(false); }
  }

  async function refreshPlan() {
    setError(null);
    const refreshed = await plan.refetch();
    if (refreshed.isSuccess) setNeedsReview(false);
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !running) onClose(); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={(event) => { if (origin?.isConnected) { event.preventDefault(); origin.focus(); } }}>
      <DialogHeader>
        <DialogTitle>Review backup</DialogTitle>
        <DialogDescription>Review which apps will be unavailable while Autark-OS copies their data.</DialogDescription>
      </DialogHeader>
      {plan.isFetching ? <p role="status">Checking backup scope…</p> : plan.isError ? <p role="alert">{apiErrorMessage(plan.error, 'Backup scope could not be checked.')}</p> : plan.data && <div className="space-y-3 text-sm">
        <div><p className="font-medium">Affected apps</p><ul className="mt-2 list-disc space-y-1 pl-5">{plan.data.apps.map(app => <li key={app.appId}>{app.appName}</li>)}</ul>{!plan.data.apps.length && <p>No apps are included in this backup.</p>}</div>
        <p>You can leave this page after the job starts. Follow progress in Activity.</p>
        {plan.data.warnings.map(warning => <p key={warning}>{warning}</p>)}
        {plan.data.blockedReasons.length > 0 && <div role="alert"><p className="font-medium">Backup unavailable</p><ul className="mt-2 list-disc space-y-1 pl-5">{plan.data.blockedReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {(plan.isError || needsReview || (plan.data && !plan.data.executable)) && <Button disabled={plan.isFetching || running} onClick={() => void refreshPlan()} variant="outline">Review again</Button>}
      <DialogFooter>
        <Button disabled={running} onClick={onClose} variant="outline">Cancel</Button>
        <Button disabled={running || plan.isFetching || plan.isError || !plan.data?.executable || needsReview} onClick={() => void confirm()}>{running ? 'Starting…' : 'Start backup'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
