import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Check,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  HardDrive,
  Info,
  Loader2,
  LockKeyhole,
  Network,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppRecoveryAPIClient } from '@/api/AppRecoveryAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { AppBrowserLink } from '@/components/autark-os/AppBrowserLink';
import { ApplicationStateNotice } from '@/components/autark-os/ApplicationStateNotice';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ResponsiveDetailsSheet } from '@/components/autark-os/ResponsiveDetailsSheet';
import { StatusBadge, type StatusBadgeTone } from '@/components/autark-os/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showActionNotification } from '@/lib/actionNotifications';
import { syncCanonicalAppMutationResult } from '@/repositories/canonicalAppMutationRepository';
import {
  currentJobStepText,
  jobProgressPercent,
  terminalJob,
  useAutarkOsJobQuery,
  useAutarkOsJobsQuery,
} from '@/repositories/jobRepository';
import {
  catalogAppIsManaged,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import type { AppRecoveryCheck, AppRecoveryPlan } from '@/types/appRecovery';
import type { AutarkOsJob, AutarkOsJobStep } from '@/types/jobs';
import type { ObservedServiceView } from '@/types/observedService';

type ObservedServiceDetailsSheetProps = {
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
  open: boolean;
  service: ObservedServiceView | null;
};

type RecoveryStage = 'review' | 'confirm';

export function ObservedServiceDetailsSheet({ onOpenChange, onRefresh, open, service }: ObservedServiceDetailsSheetProps) {
  const appState = useApplicationStateRepository();
  const queryClient = useQueryClient();
  const jobsQuery = useAutarkOsJobsQuery();
  const [recoveryService, setRecoveryService] = useState<ObservedServiceView | null>(service);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [plan, setPlan] = useState<AppRecoveryPlan | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryStage, setRecoveryStage] = useState<RecoveryStage>('review');
  const [transferAcknowledged, setTransferAcknowledged] = useState(false);
  const [recoveryJob, setRecoveryJob] = useState<AutarkOsJob | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const preparedServiceId = useRef<string | null>(null);
  const notifiedJob = useRef<string | null>(null);
  const currentService = service ?? recoveryService;
  const activeRecoveryJobId = recoveryJob && !terminalJob(recoveryJob) ? recoveryJob.jobId : null;
  const recoveryJobQuery = useAutarkOsJobQuery(activeRecoveryJobId);

  useEffect(() => {
    if (!service) return;
    setRecoveryService(service);
    if (preparedServiceId.current === service.id) return;
    preparedServiceId.current = service.id;
    setPlan(null);
    setRecoveryOpen(false);
    setRecoveryStage('review');
    setTransferAcknowledged(false);
    setRecoveryJob(null);
    setLocalError(null);
    notifiedJob.current = null;
  }, [service]);

  useEffect(() => {
    if (recoveryJobQuery.data) setRecoveryJob(recoveryJobQuery.data);
  }, [recoveryJobQuery.data]);

  useEffect(() => {
    if (!open || recoveryJob || !currentService?.catalogAppId) return;
    const activeJob = (jobsQuery.data ?? []).find((job) =>
      job.type === 'recover_app'
      && job.subjectId === currentService.catalogAppId
      && !terminalJob(job));
    if (!activeJob) return;
    setRecoveryJob(activeJob);
    setRecoveryOpen(true);
  }, [currentService?.catalogAppId, jobsQuery.data, open, recoveryJob]);

  useEffect(() => {
    if (!recoveryJob || !terminalJob(recoveryJob) || notifiedJob.current === recoveryJob.jobId) return;
    notifiedJob.current = recoveryJob.jobId;
    const succeeded = recoveryJob.status === 'succeeded';
    showActionNotification({
      ok: succeeded,
      severity: succeeded ? 'success' : 'error',
      title: succeeded ? 'App recovery completed' : 'App recovery needs attention',
      message: succeeded
        ? `${currentService?.displayName || 'The app'} is fully managed. Its lifecycle controls are ready.`
        : recoveryJob.error?.message || 'Autark-OS restored the previous runtime and left the app recoverable.',
    }, succeeded ? 'App recovery completed' : 'App recovery failed');
  }, [currentService?.displayName, recoveryJob]);

  const actions = useMemo(
    () => new Map((currentService?.availableActions || []).map((action) => [action.id, action])),
    [currentService?.availableActions],
  );

  if (!currentService) {
    return (
      <ResponsiveDetailsSheet
        className="sm:max-w-lg"
        model={{ description: 'Autark-OS could not find that observed service in the current inventory.', title: 'Service not found' }}
        onOpenChange={onOpenChange}
        open={open}
      >
        <p className="text-sm leading-6 text-slate-300">Refresh the existing-app inventory and choose the service again.</p>
      </ResponsiveDetailsSheet>
    );
  }

  const recoveryAction = actions.get('recovery_plan');
  const canReviewRecovery = Boolean(recoveryAction) && !recoveryAction?.disabled
    && currentService.recoveryCandidate && Boolean(currentService.catalogAppId);
  const installCopyAction = actions.get('install_copy');
  const installCopyHref = installCopyAction?.href
    || (currentService.catalogAppId ? `/discover?app=${encodeURIComponent(currentService.catalogAppId)}` : null);
  const canInstallCopy = Boolean(installCopyHref)
    && !catalogAppIsManaged(appState.applicationState, currentService.catalogAppId);

  async function loadPlan() {
    const appId = currentService?.catalogAppId;
    if (!appId) return;
    setRecoveryOpen(true);
    setRecoveryStage('review');
    setTransferAcknowledged(false);
    setRecoveryJob(null);
    setPlan(null);
    setBusyAction('recovery_plan');
    setLocalError(null);
    try {
      setPlan(await AppRecoveryAPIClient.plan(appId));
    } catch (error) {
      setLocalError(apiErrorMessage(error, 'Recovery plan could not be loaded.'));
    } finally {
      setBusyAction(null);
    }
  }

  async function runRecovery() {
    const appId = currentService?.catalogAppId;
    if (!appId || !plan) return;
    setBusyAction('recover');
    setLocalError(null);
    try {
      const job = await AppRecoveryAPIClient.apply(
        appId,
        plan.planId,
        !plan.ownershipTransferRequired || transferAcknowledged,
      );
      setRecoveryJob(job);
      syncCanonicalAppMutationResult(queryClient, job);
    } catch (error) {
      const message = apiErrorMessage(error, 'App recovery could not be started. Review a fresh plan and try again.');
      setRecoveryStage('review');
      try {
        setPlan(await AppRecoveryAPIClient.plan(appId));
        setLocalError(message.includes('409')
          ? 'The app changed after this review. Autark-OS loaded a fresh recovery plan.'
          : message);
      } catch {
        setLocalError(message);
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function finishRecovery() {
    setRecoveryOpen(false);
    onOpenChange(false);
    await onRefresh();
  }

  return (
    <>
      <ResponsiveDetailsSheet
        className="sm:max-w-xl"
        footer={<Button className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900" onClick={() => onOpenChange(false)} type="button" variant="outline">Close</Button>}
        headerAccessory={<StatusBadge tone={stateBadgeTone(currentService)}>{currentService.userStatusLabel || 'Found'}</StatusBadge>}
        model={{ description: currentService.userStatusDescription || 'Autark-OS observes this service but does not manage it.', title: currentService.displayName }}
        onOpenChange={onOpenChange}
        open={open}
        titleClassName="font-black"
      >
        <div className="grid gap-5">
          <ApplicationStateNotice />

          <section className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Detail label="Runtime" value={currentService.runtimeState || 'Unknown'} />
              <Detail label="Access" value={currentService.accessScope || 'Unknown'} />
              <Detail label="Source" value={currentService.source || 'Unknown'} />
              <Detail label="Catalog match" value={currentService.catalogAppId || 'Unmatched'} />
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-sm font-black uppercase tracking-normal text-slate-400">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {currentService.url && (
                <Button asChild className="bg-sky-500 text-slate-950 hover:bg-sky-400" size="sm">
                  <AppBrowserLink href={currentService.url} rel="noreferrer" target="_blank">
                    <ExternalLink className="size-4" />
                    Open
                  </AppBrowserLink>
                </Button>
              )}
              {canInstallCopy && (
                <Button asChild className="border-amber-300/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15" size="sm" variant="outline">
                  <Link to={installCopyHref || '/discover'}>
                    <ShieldAlert className="size-4" />
                    Install separate copy
                  </Link>
                </Button>
              )}
            </div>
          </section>

          {recoveryAction && (
            <section className="grid gap-3 rounded-lg border border-amber-300/20 bg-amber-500/8 p-4">
              <div>
                <h3 className="font-bold text-white">Recovery available</h3>
                <p className="mt-1 text-sm leading-6 text-amber-100/75">
                  {recoveryAction.disabled
                    ? recoveryAction.reason || 'This app cannot be recovered safely yet.'
                    : 'Review how Autark-OS can restore complete management while preserving this app’s data.'}
                </p>
              </div>
              {canReviewRecovery && (
                <DisabledAction disabled={busyAction !== null} reason="Wait for the current service action to finish.">
                  <Button className="w-fit bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={busyAction !== null} onClick={() => void loadPlan()} type="button">
                    {busyAction === 'recovery_plan' ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
                    Review recovery
                  </Button>
                </DisabledAction>
              )}
            </section>
          )}

          <section className="grid gap-2 border-t border-slate-800 pt-5 text-sm text-slate-400">
            <h3 className="font-bold text-white">Technical details</h3>
            {Object.entries(currentService.metadata || {}).length
              ? Object.entries(currentService.metadata || {}).map(([key, value]) => <Detail key={key} label={key} value={value || 'Unknown'} />)
              : <p>No extra details reported.</p>}
          </section>
        </div>
      </ResponsiveDetailsSheet>

      <RecoveryDialog
        acknowledged={transferAcknowledged}
        busy={busyAction === 'recover'}
        error={localError}
        job={recoveryJob}
        loading={busyAction === 'recovery_plan'}
        onAcknowledged={setTransferAcknowledged}
        onClose={() => setRecoveryOpen(false)}
        onFinish={() => void finishRecovery()}
        onRecover={() => void runRecovery()}
        onReload={() => void loadPlan()}
        onStageChange={setRecoveryStage}
        open={recoveryOpen}
        plan={plan}
        service={currentService}
        stage={recoveryStage}
      />
    </>
  );
}

function RecoveryDialog({
  acknowledged,
  busy,
  error,
  job,
  loading,
  onAcknowledged,
  onClose,
  onFinish,
  onRecover,
  onReload,
  onStageChange,
  open,
  plan,
  service,
  stage,
}: {
  acknowledged: boolean;
  busy: boolean;
  error: string | null;
  job: AutarkOsJob | null;
  loading: boolean;
  onAcknowledged: (value: boolean) => void;
  onClose: () => void;
  onFinish: () => void;
  onRecover: () => void;
  onReload: () => void;
  onStageChange: (stage: RecoveryStage) => void;
  open: boolean;
  plan: AppRecoveryPlan | null;
  service: ObservedServiceView;
  stage: RecoveryStage;
}) {
  const running = job && !terminalJob(job);
  const succeeded = job?.status === 'succeeded';
  const failed = job && terminalJob(job) && !succeeded;

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="h-[calc(100dvh-2rem)] grid-rows-[minmax(0,1fr)] overflow-hidden sm:h-[34rem] sm:max-w-xl">
        {loading && !plan ? <RecoveryLoading />
          : running ? <RecoveryRunning job={job} />
            : succeeded ? <RecoveryVerified onFinish={onFinish} service={service} />
              : failed ? <RecoveryFailed job={job} onClose={onClose} onReload={onReload} />
                : stage === 'confirm' && plan ? (
                  <RecoveryConfirmation
                    acknowledged={acknowledged}
                    onAcknowledged={onAcknowledged}
                    onBack={() => onStageChange('review')}
                    onRecover={onRecover}
                    plan={plan}
                  />
                ) : (
                  <RecoveryReview
                    busy={busy}
                    error={error}
                    onCancel={onClose}
                    onContinue={() => plan?.ownershipTransferRequired ? onStageChange('confirm') : onRecover()}
                    onReload={onReload}
                    plan={plan}
                  />
                )}
      </DialogContent>
    </Dialog>
  );
}

function RecoveryLoading() {
  return (
    <div className="grid min-h-0 place-items-center text-center">
      <div>
        <Loader2 className="mx-auto size-8 animate-spin text-primary" />
        <DialogTitle className="mt-4 text-lg">Preparing recovery review</DialogTitle>
        <DialogDescription className="mt-2">Checking Docker, app storage, settings, and ownership.</DialogDescription>
      </div>
    </div>
  );
}

function RecoveryReview({ busy, error, onCancel, onContinue, onReload, plan }: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onContinue: () => void;
  onReload: () => void;
  plan: AppRecoveryPlan | null;
}) {
  const checks = compactChecks(plan?.checks || []);
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <DialogHeader className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-4">
        <div className="flex items-center gap-3 pr-8">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ArchiveRestore className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-lg">Recover {plan?.appName || 'app'}</DialogTitle>
              {plan?.applicable && <Badge className="border-success/30 bg-success/10 text-success" variant="outline">Ready</Badge>}
            </div>
            <DialogDescription className="mt-1">Bring this app under your current Autark-OS installation.</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 content-start gap-4">
        {error && (
          <Alert variant="destructive">
            <CircleAlert className="size-4" />
            <AlertTitle>Recovery review needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {plan ? (
          <>
            <p className="text-sm leading-6 text-muted-foreground">{plan.summary}</p>
            {plan.applicable ? (
              <>
                <div className="grid gap-3 rounded-lg border border-primary/15 bg-primary/5 p-4 text-sm sm:grid-cols-2">
                  <RecoverySummary icon={HardDrive} title="Your app data stays in place" detail="Existing files and settings are preserved." />
                  <RecoverySummary
                    icon={RotateCcw}
                    title={plan.ownershipTransferRequired ? 'Brief interruption' : 'No app restart needed'}
                    detail={plan.ownershipTransferRequired ? `${plan.appName} will restart during recovery.` : 'Only the missing registration will be restored.'}
                  />
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recovery details</p>
                  <TooltipProvider>
                    <div className="mt-1 grid gap-x-5 sm:grid-cols-2">
                      {checks.map((check) => <CompactRecoveryCheck check={check} key={check.id} />)}
                    </div>
                  </TooltipProvider>
                  <div className="mt-2 rounded-md bg-muted/60 px-3 py-2.5">
                    <p className="text-xs font-medium text-foreground">
                      Checkpoint <span className="text-muted-foreground">→</span> transfer management <span className="text-muted-foreground">→</span> verify health and access
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">If verification fails, the previous runtime is restored.</p>
                  </div>
                </div>
              </>
            ) : (
              <Alert className="border-warning/30 bg-warning/10">
                <ShieldAlert className="size-4 text-warning" />
                <AlertTitle>Recovery is not safe yet</AlertTitle>
                <AlertDescription>{plan.blockedReasons.join(' ')}</AlertDescription>
              </Alert>
            )}
          </>
        ) : !error ? <p className="text-sm text-muted-foreground">No recovery plan is available.</p> : null}
      </div>

      <DialogFooter>
        <Button onClick={onCancel} variant="outline">Leave unchanged</Button>
        {plan?.applicable
          ? <Button disabled={busy} onClick={onContinue}>{busy && <Loader2 className="size-4 animate-spin" />}Continue</Button>
          : <Button disabled={busy} onClick={onReload} variant="outline">Check again</Button>}
      </DialogFooter>
    </div>
  );
}

function RecoveryConfirmation({ acknowledged, onAcknowledged, onBack, onRecover, plan }: {
  acknowledged: boolean;
  onAcknowledged: (value: boolean) => void;
  onBack: () => void;
  onRecover: () => void;
  plan: AppRecoveryPlan;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">Transfer management?</DialogTitle>
        <DialogDescription>
          This Autark-OS installation will become {plan.appName}&apos;s owner and provide the same controls as a newly installed app.
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 content-start gap-4">
        <Alert className="border-warning/30 bg-warning/10">
          <LockKeyhole className="size-4 text-warning" />
          <AlertTitle>The previous installation will no longer be the owner</AlertTitle>
          <AlertDescription>No app data will be deleted or moved.</AlertDescription>
        </Alert>
        <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
          <Checkbox checked={acknowledged} className="mt-0.5" onCheckedChange={(value) => onAcknowledged(value === true)} />
          <span>I understand {plan.appName} will briefly restart while management transfers.</span>
        </label>
      </div>
      <DialogFooter>
        <Button onClick={onBack} variant="outline">Back</Button>
        <Button disabled={!acknowledged} onClick={onRecover}>
          <ArchiveRestore className="size-4" />
          Recover {plan.appName}
        </Button>
      </DialogFooter>
    </div>
  );
}

function RecoveryRunning({ job }: { job: AutarkOsJob }) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">Recovering app</DialogTitle>
        <DialogDescription>{currentJobStepText(job, 'Autark-OS is verifying recovery.')}</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 content-center gap-5">
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${jobProgressPercent(job)}%` }} />
          </div>
          <p className="mt-2 text-right text-xs text-muted-foreground">{jobProgressPercent(job)}%</p>
        </div>
        <div className="grid gap-2 text-sm">
          {job.steps.map((step) => <RecoveryProgressRow key={step.id} step={step} />)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">You can close this dialog. Recovery will continue as a durable Autark-OS task.</p>
    </div>
  );
}

function RecoveryVerified({ onFinish, service }: { onFinish: () => void; service: ObservedServiceView }) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <DialogHeader className="flex-1 items-center justify-center text-center">
        <span className="grid size-12 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-7" />
        </span>
        <DialogTitle className="text-lg">{service.displayName} is fully managed</DialogTitle>
        <DialogDescription>Ownership, health, access, settings, backup, and lifecycle controls are ready.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={onFinish} variant="outline">Close</Button>
        {service.url && (
          <Button asChild>
            <AppBrowserLink href={service.url} onClick={onFinish} rel="noreferrer" target="_blank">Open {service.displayName}</AppBrowserLink>
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function RecoveryFailed({ job, onClose, onReload }: { job: AutarkOsJob; onClose: () => void; onReload: () => void }) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">Recovery did not complete</DialogTitle>
        <DialogDescription>Autark-OS attempted to restore the previous runtime and left the app recoverable.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1">
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Review before trying again</AlertTitle>
          <AlertDescription>{job.error?.message || 'The recovery task failed without additional detail.'}</AlertDescription>
        </Alert>
      </div>
      <DialogFooter>
        <Button onClick={onClose} variant="outline">Close</Button>
        <Button onClick={onReload}>Review fresh plan</Button>
      </DialogFooter>
    </div>
  );
}

function RecoverySummary({ detail, icon: Icon, title }: { detail: string; icon: typeof HardDrive; title: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function CompactRecoveryCheck({ check }: { check: AppRecoveryCheck }) {
  const Icon = recoveryCheckIcon(check.id);
  return (
    <div className="flex min-w-0 items-center gap-2 py-1.5">
      <Check className="size-3.5 shrink-0 text-success" />
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-xs font-medium text-foreground">{check.label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`${check.label} details`}
            className="ml-auto grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 leading-5" sideOffset={4}>{check.message} {check.detail}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function RecoveryProgressRow({ step }: { step: AutarkOsJobStep }) {
  const complete = step.status === 'succeeded';
  const active = step.status === 'running';
  const failed = step.status === 'failed';
  return (
    <div className="flex items-center gap-2">
      {complete ? <CheckCircle2 className="size-4 text-success" />
        : active ? <Loader2 className="size-4 animate-spin text-primary" />
          : failed ? <CircleAlert className="size-4 text-destructive" />
            : <span className="size-4 rounded-full border" />}
      <span className={complete ? 'text-muted-foreground' : 'font-medium text-foreground'}>{step.label}</span>
    </div>
  );
}

function compactChecks(checks: AppRecoveryCheck[]) {
  const preferred = ['catalog_identity', 'mounts', 'ports', 'docker_ownership'];
  return preferred.flatMap((id) => checks.find((check) => check.id === id) || []);
}

function recoveryCheckIcon(id: string) {
  if (id === 'mounts') return HardDrive;
  if (id === 'ports') return Network;
  if (id === 'docker_ownership') return LockKeyhole;
  return CheckCircle2;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-normal text-slate-500">{label}</dt>
      <dd className="m-0 mt-1 truncate text-slate-200" title={value}>{value}</dd>
    </div>
  );
}

function stateBadgeTone(service: ObservedServiceView): StatusBadgeTone {
  if (service.userStatus === 'recoverable' || service.userStatus === 'failed_install') return 'warning';
  if (service.userStatus === 'managed_elsewhere' || service.userStatus === 'blocked') return 'danger';
  return 'neutral';
}
