import { AppBrowserLink } from '@/components/autark-os/AppBrowserLink';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, RotateCcw, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppRecoveryAPIClient } from '@/api/AppRecoveryAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ApplicationStateNotice } from '@/components/autark-os/ApplicationStateNotice';
import { ResponsiveDetailsSheet } from '@/components/autark-os/ResponsiveDetailsSheet';
import { StatusBadge, type StatusBadgeTone } from '@/components/autark-os/StatusBadge';
import { showActionErrorNotification } from '@/lib/actionNotifications';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  catalogAppIsManaged,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import type { AppRecoveryCheck, AppRecoveryPlan, AppRecoveryResult } from '@/types/appRecovery';
import type { ObservedServiceView } from '@/types/observedService';

type ObservedServiceDetailsSheetProps = {
  onActionComplete: (result: AppRecoveryResult) => void;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
  open: boolean;
  service: ObservedServiceView | null;
};

export function ObservedServiceDetailsSheet({ onActionComplete, onOpenChange, onRefresh, open, service }: ObservedServiceDetailsSheetProps) {
  const appState = useApplicationStateRepository();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [plan, setPlan] = useState<AppRecoveryPlan | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setPlan(null);
    setConfirmation('');
    setLocalError(null);
  }, [service?.id]);

  const actions = useMemo(() => new Map((service?.availableActions || []).map((action) => [action.id, action])), [service?.availableActions]);

  if (!service) {
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

  const currentService = service;

  const recoveryAction = actions.get('recovery_plan');
  const canReviewRecovery = Boolean(recoveryAction) && !recoveryAction?.disabled && service.recoveryCandidate && Boolean(service.catalogAppId);
  const installCopyAction = actions.get('install_copy');
  const installCopyHref = installCopyAction?.href || (service.catalogAppId ? `/discover?app=${encodeURIComponent(service.catalogAppId)}` : null);
  const canInstallCopy = Boolean(installCopyHref) && !catalogAppIsManaged(appState.applicationState, service.catalogAppId);
  const blockedReasons = planList(plan?.blockedReasons);
  const confirmationText = plan?.confirmationText || '';
  const recoveryDisabled = busyAction !== null || !plan?.applicable || blockedReasons.length > 0 || confirmation !== confirmationText;

  async function runRecovery() {
    if (!currentService.catalogAppId) return;
    setBusyAction('recover');
    setLocalError(null);
    try {
      const result = await AppRecoveryAPIClient.apply(currentService.catalogAppId, confirmation);
      onActionComplete(result);
      if (result.ok) await onRefresh();
    } catch (error) {
      const message = apiErrorMessage(error, 'App recovery could not be completed.');
      setLocalError(message);
      showActionErrorNotification(error, 'App recovery failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function loadPlan() {
    if (!currentService.catalogAppId) return;
    const appId = currentService.catalogAppId;
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

  return (
    <ResponsiveDetailsSheet
      className="sm:max-w-xl"
      footer={<Button className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900" onClick={() => onOpenChange(false)} type="button" variant="outline">Close</Button>}
      headerAccessory={<StatusBadge tone={stateBadgeTone(service)}>{service.userStatusLabel || 'Found'}</StatusBadge>}
      model={{ description: service.userStatusDescription || 'Autark-OS observes this service but does not manage it.', title: service.displayName }}
      onOpenChange={onOpenChange}
      open={open}
      titleClassName="font-black"
    >
        <div className="grid gap-5">
          <ApplicationStateNotice />
          {localError && (
            <Alert className="border-red-300/25 bg-red-500/10 text-red-100">
              <ShieldAlert className="size-4" />
              <AlertTitle>Action needs attention</AlertTitle>
              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          )}

          <section className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Detail label="Runtime" value={service.runtimeState || 'Unknown'} />
              <Detail label="Access" value={service.accessScope || 'Unknown'} />
              <Detail label="Source" value={service.source || 'Unknown'} />
              <Detail label="Catalog match" value={service.catalogAppId || 'Unmatched'} />
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-sm font-black uppercase tracking-normal text-slate-400">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {service.url && (
                <Button asChild className="bg-sky-500 text-slate-950 hover:bg-sky-400" size="sm">
                  <AppBrowserLink href={service.url} rel="noreferrer" target="_blank">
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
                <h3 className="font-bold text-white">Recovery plan</h3>
                <p className="mt-1 text-sm leading-6 text-amber-100/75">{recoveryAction.disabled ? recoveryAction.reason || 'This app cannot be recovered safely yet.' : 'Review the evidence Autark-OS must verify before restoring full management.'}</p>
              </div>
              {canReviewRecovery && !plan && (
                <DisabledAction disabled={busyAction !== null} reason="Wait for the current service action to finish before loading a recovery plan.">
                  <Button className="w-fit bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={busyAction !== null} onClick={loadPlan} type="button">
                    {busyAction === 'recovery_plan' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                    Review recovery plan
                  </Button>
                </DisabledAction>
              )}
              {plan && (
                <div className="grid gap-3 text-sm">
                  <p className="leading-6 text-amber-50/85">{plan.summary}</p>
                  <RecoveryChecks checks={plan.checks} />
                  <PlanList title="Containers" items={plan.containers} />
                  <PlanList title="Data mappings" items={plan.mounts} />
                  <PlanList title="Published ports" items={plan.ports} />
                  <PlanList title="Recovery steps" items={plan.steps} />
                  <PlanList title="Blocked" items={blockedReasons} />
                  {plan.applicable && (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="recovery-confirmation">Type {confirmationText}</Label>
                        <Input id="recovery-confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
                      </div>
                      <DisabledAction disabled={recoveryDisabled} reason={busyAction !== null ? 'Wait for the current service action to finish.' : 'Type the confirmation text exactly before restoring management.'}>
                        <Button className="w-fit bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={recoveryDisabled} onClick={() => void runRecovery()} type="button">
                          {busyAction === 'recover' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                          Recover app
                        </Button>
                      </DisabledAction>
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          <Separator className="bg-slate-800" />
          <section className="grid gap-2 text-sm text-slate-400">
            <h3 className="font-bold text-white">Technical details</h3>
            {Object.entries(service.metadata || {}).length ? Object.entries(service.metadata).map(([key, value]) => <Detail key={key} label={key} value={value || 'Unknown'} />) : <p>No extra details reported.</p>}
          </section>
        </div>
    </ResponsiveDetailsSheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-normal text-slate-500">{label}</dt>
      <dd className="m-0 mt-1 truncate text-slate-200" title={value}>{value}</dd>
    </div>
  );
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return null;
  }
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-500">{title}</p>
      <ul className="mt-2 grid gap-1 text-slate-300">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function RecoveryChecks({ checks }: { checks: AppRecoveryCheck[] }) {
  return (
    <div className="grid gap-2">
      {checks.map((check) => (
        <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3" key={check.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-slate-100">{check.label}</p>
            <StatusBadge tone={check.status === 'passed' ? 'success' : 'warning'}>{check.status === 'passed' ? 'Verified' : 'Blocked'}</StatusBadge>
          </div>
          <p className="mt-1 leading-6 text-slate-300">{check.message}</p>
          {check.detail && <p className="mt-1 break-words text-xs text-slate-500">{check.detail}</p>}
        </div>
      ))}
    </div>
  );
}

function planList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stateBadgeTone(service: ObservedServiceView): StatusBadgeTone {
  if (service.userStatus === 'recoverable' || service.userStatus === 'failed_install') return 'warning';
  if (service.userStatus === 'managed_elsewhere' || service.userStatus === 'blocked') return 'danger';
  return 'neutral';
}
