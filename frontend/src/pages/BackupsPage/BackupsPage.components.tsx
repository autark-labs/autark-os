import { JobProgress } from '@/components/autark-os/JobProgress';
import type { AutarkOsJob } from '@/types/jobs';
import { terminalJob } from '@/repositories/jobRepository';
import { Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset as BackupInset } from '@/components/primitives/Surface';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AppBackupStatus, RestorePlan, RestorePoint } from '@/types/backup';
import { restorePointDetails } from './BackupsPage.restoreDetails';
import { type BackupOperationAvailability, formatBackupBytes, formatBackupDate } from './BackupsPage.logic';

export type RestoreFlowState = {
  error: string | null;
  phase: 'details' | 'loading' | 'plan_error' | 'planning' | 'confirm' | 'unavailable' | 'submitting' | 'unknown' | 'submitted';
  job?: AutarkOsJob | null;
  plan: RestorePlan | null;
  point: RestorePoint | null;
  targetAppId: string | null;
};

export function RestoreFlowDialog({
  appOptions,
  flow,
  loading,
  onClose,
  onRestore,
  onRetryPlan,
  onTargetChange,
  onVerify,
  restoreAvailability,
  running,
  timeZone,
  verifyAvailability,
}: {
  appOptions: AppBackupStatus[];
  flow: RestoreFlowState | null;
  loading: boolean;
  onClose: () => void;
  onRestore: () => void;
  onRetryPlan: () => void;
  onTargetChange: (appId: string | null) => void;
  onVerify: (point: RestorePoint) => void;
  restoreAvailability: BackupOperationAvailability;
  running: string | null;
  timeZone: string;
  verifyAvailability: BackupOperationAvailability;
}) {
  const point = flow?.point ?? null;
  const plan = flow?.plan ?? null;
  const details = point ? restorePointDetails(point, appOptions) : null;
  const included = point?.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
  const selectableApps = point?.scope === 'full'
    ? appOptions.filter((app) => included.includes(app.appId))
    : appOptions.filter((app) => app.appId === point?.appId);
  const reviewingDetails = flow?.phase === 'details';
  const planLoading = flow?.phase === 'planning' || flow?.phase === 'loading';
  const submissionStarted = flow?.phase === 'submitting' || flow?.phase === 'unknown' || flow?.phase === 'submitted';
  const planFailed = flow?.phase === 'plan_error';

  return (
    <Dialog open={Boolean(flow)} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto border-sky-400/30 bg-slate-900 text-slate-100 sm:w-full">
        <DialogHeader>
          <DialogTitle>{reviewingDetails ? details?.title || 'Restore point details' : submissionStarted ? 'Restore status' : flow?.phase === 'loading' ? 'Restore point details' : plan?.title || 'Restore backup'}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {submissionStarted ? 'Closing this dialog does not cancel the restore. Follow its progress in Activity.' : reviewingDetails
              ? 'Review what this backup contains before verifying or restoring it.'
              : flow?.phase === 'loading' ? 'Loading saved archive information.' : planLoading
                ? 'Autark-OS is checking the restore plan before it can be confirmed.'
                : planFailed
                  ? 'Autark-OS could not load a complete restore plan. Retry before restoring.'
                  : plan?.summary || 'Review what Autark-OS will restore before continuing.'}
          </DialogDescription>
        </DialogHeader>

        {reviewingDetails && point && details && (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <FactRow label="Created" value={formatBackupDate(point.createdAt, timeZone)} />
              <FactRow label="Size" value={formatBackupBytes(point.sizeBytes)} />
              <FactRow label="Source" value={point.source} />
            </div>
            <InfoBlock title="Included apps" values={details.includedApps.length ? details.includedApps : ['No matching installed apps were found for this restore point.']} />
            <InfoBlock title="Verification" values={[details.verification, point.verificationMessage || 'No verification note recorded.', `Checksum: ${details.checksum}`]} />
            <InfoBlock tone="warning" title="Warnings" values={details.warnings} />
            <InfoBlock title="Stored at" values={[details.location]} />
            <InfoBlock title="Retention" values={[...(point.source === 'automatic' ? ['Routine archives follow the configured retention policy.'] : []), 'Manual and safety archives are retained until explicitly removed. Archive deletion is not yet available in Autark-OS.']} />
          </div>
        )}

        {submissionStarted && <div className="grid gap-3">
          {flow?.phase === 'submitting' && <p role="status">Submitting the reviewed restore… You can close this dialog while Autark-OS accepts the job.</p>}
          {flow?.phase === 'unknown' && <><p role="status">The response was lost, so acceptance is not yet known. Check Activity before starting another restore.</p><ProjectDarkControlButton onClick={onRetryPlan} type="button">Check Activity</ProjectDarkControlButton></>}
          {flow?.phase === 'submitted' && (flow.job ? <><JobProgress job={flow.job} /><p className="text-sm text-muted-foreground">{terminalJob(flow.job) ? 'The recorded result is available in Activity history.' : 'The restore job continues after you close this dialog.'}</p></> : <p role="status">The restore was accepted. Follow its progress in Activity.</p>)}
        </div>}

        {planLoading && (
          <div className="grid place-items-center gap-3 rounded-lg border border-sky-400/25 bg-slate-950/60 p-6 text-center">
            <Loader2 className="size-5 animate-spin text-cyan-200" />
            <p className="text-sm text-slate-300">{flow?.phase === 'loading' ? 'Loading restore point…' : 'Loading the restore plan…'}</p>
          </div>
        )}

        {flow?.phase === 'unavailable' && <RestoreIssue message={flow.error!} onRetry={onRetryPlan} title="Restore point unavailable" />}

        {planFailed && <RestoreIssue message={flow?.error || 'Restore plan could not be loaded.'} onRetry={onRetryPlan} title="Restore plan unavailable" />}

        {flow?.phase === 'confirm' && point && (
          <div className="grid gap-4">
            {point.scope === 'full' && (
              <BackupInset>
                <label className="text-xs font-bold uppercase text-slate-500" htmlFor="restore-target">Restore target</label>
                <Select onValueChange={(value) => onTargetChange(value === 'all' ? null : value)} value={flow.targetAppId || 'all'}>
                  <SelectTrigger className="mt-2 h-10 w-full border-slate-700 bg-slate-950/70 text-slate-100" id="restore-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-950 text-slate-100">
                    <SelectGroup>
                      <SelectItem className="focus:bg-slate-800 focus:text-white" value="all">All included apps (requires every app to be ready)</SelectItem>
                      {selectableApps.map((app) => (
                        <SelectItem className="focus:bg-slate-800 focus:text-white" key={app.appId} value={app.appId}>{app.appName} only</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </BackupInset>
            )}
            {plan && (
              <>
                <InfoBlock title="Archive scope" values={plan.apps.map(app => `${app.appName} — ${app.status === 'restorable' ? 'Ready to restore' : app.status === 'excluded' ? 'Not selected' : app.status === 'missing' ? 'Not currently managed' : 'Blocked'}: ${app.message}`)} />
                {plan.blockedReasons.length > 0 && <InfoBlock tone="warning" title="Restore blocked" values={plan.blockedReasons} />}
                <InfoBlock title={plan.executable ? "Autark-OS will restore" : "Requested apps"} values={plan.affectedApps.length ? plan.affectedApps : ['No installed app matches this restore point.']} />
                <InfoBlock title="What will change" values={plan.steps.length ? plan.steps : ['Autark-OS will stop affected apps, replace their data with this restore point, then start them again.']} />
                <InfoBlock tone="warning" title="What is preserved" values={plan.warnings.length ? plan.warnings : ['A safety restore point is created and verified before data is replaced. If that checkpoint fails, restoration does not proceed. Other apps are left unchanged.']} />
                {flow.error && <RestoreIssue message={flow.error} onRetry={onRetryPlan} title="Restore could not start" />}
                <details className="rounded-lg border border-sky-400/20 bg-slate-950/60 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-200">Technical restore details</summary>
                  <div className="mt-3 grid gap-3">
                    <InfoBlock title="Archive verification" values={[`${plan.restoreConfidence}: ${plan.verificationMessage || 'No verification details recorded yet.'}`]} />
                    <InfoBlock tone={plan.simulation.status === 'failed' || plan.simulation.status === 'warning' ? 'warning' : 'default'} title="Restore simulation" values={[plan.simulation.message, ...plan.simulation.details]} />
                    <InfoBlock title="Backup contract check" values={plan.dryRunDetails.length ? plan.dryRunDetails : ['No app-specific backup contract details were found.']} />
                  </div>
                </details>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <ProjectDarkControlButton onClick={onClose} type="button">{submissionStarted || reviewingDetails ? 'Close' : 'Cancel'}</ProjectDarkControlButton>
          {reviewingDetails && point && (
            <>
              <DisabledAction disabled={verifyAvailability.disabled} reason={verifyAvailability.reason}>
                <ProjectDarkControlButton disabled={verifyAvailability.disabled} onClick={() => onVerify(point)} type="button">
                  {running === `verify-${point.id}` ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  {point.verifiedAt ? 'Verify again' : 'Verify'}
                </ProjectDarkControlButton>
              </DisabledAction>
              <DisabledAction disabled={restoreAvailability.disabled} reason={restoreAvailability.reason}>
                <ProjectPrimaryButton disabled={restoreAvailability.disabled} onClick={() => onTargetChange(null)} type="button">
                  <RotateCcw className="size-4" />
                  Restore
                </ProjectPrimaryButton>
              </DisabledAction>
            </>
          )}
          {flow?.phase === 'confirm' && (
            <DisabledAction disabled={restoreAvailability.disabled || !plan?.executable || loading || Boolean(flow.error)} reason={restoreAvailability.disabled ? restoreAvailability.reason : loading ? 'Wait for the restore job to start.' : flow.error ? 'Review the plan again before submitting another restore.' : 'This restore point cannot be restored until the complete restore plan is executable.'}>
              <ProjectPrimaryButton disabled={restoreAvailability.disabled || !plan?.executable || loading || Boolean(flow.error)} onClick={onRestore} type="button">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Restore now
              </ProjectPrimaryButton>
            </DisabledAction>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestoreIssue({ message, onRetry, title }: { message: string; onRetry: () => void; title: string }) {
  return (
    <div className="rounded-lg border border-red-400/45 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-5 text-red-100/80">{message}</p>
      <ProjectDarkControlButton className="mt-3" onClick={onRetry} size="sm" type="button">Retry plan</ProjectDarkControlButton>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <BackupInset>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-200">{value}</p>
    </BackupInset>
  );
}

function InfoBlock({ title, tone = 'default', values }: { title: string; tone?: 'default' | 'warning'; values: string[] }) {
  return (
    <div className={cn('rounded-lg border p-3', tone === 'warning' ? 'border-orange-400/45 bg-orange-500/10 text-orange-200' : 'border-sky-400/25 bg-slate-800 text-slate-300')}>
      <p className="text-sm font-bold text-white">{title}</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
        {values.map((value) => <li key={value}>{value}</li>)}
      </ul>
    </div>
  );
}
